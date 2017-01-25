"""
This module contains the prediction logic for state switch times
based on markov chains
"""

# -*- coding: utf-8 -*-

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2017 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

import logging
import time

from on_reader.livestatus import livestatus

from prediction_worker import PredictionOperation
from prediction_helper import PredictionHelper, PredictionValue

class FromValueException(Exception):
    """ Thrown when we receive an incorrect value in the 'from' parameter """
    def __init__(self, received_value):
        super(FromValueException, self).__init__()
        self.message = 'Invalid value for the "from" parameter: {}'.format(received_value)

class StateSwitchWorker(PredictionOperation):
    """
    Implements markov chains transition matrix algorithm and runs it on a specified host or service
    """

    def internal_run(self, hostname, servicename, timeout, data_length=0, **kwargs):
        """
        In addition to the standard arguments, this algorithm accepts:
        'service' allows you to specify which service to run the algorithm on
        within the specified host. If not specified, we will run on the host status probe.
        'from' allows you to specify which metric you want; valid values are 1
        (to get the time from OK to ERROR, which is the default), 2 (WARNING to ERROR),
        or 3 (CRITICAL to ERROR)
        """

        # Parse arguments
        from_id = 1
        if 'from' in kwargs:
            from_id = kwargs['from']
            if not from_id is int or from_id < 1 or from_id > 3:
                raise FromValueException(from_id)

        logging.debug("[State Switch Worker] Starting on hostname '%s', service name '%s'",
                      hostname,
                      servicename)

        # Read
        if data_length == 0: # If no data length specified
            data_length = 30 # Default to one month of data
        logging.debug("[State Switch Worker] Getting %s days of data", data_length)
        from_time = time.time() - data_length * 24 * 3600

        # To avoid having bajillions of values we'll handle only one list of states at a time
        # One state / minute, which is a lot over one month but allows us to be compatible with any
        # possible check interval
        checkinterval = StateSwitchWorker.__get_checkinterval(hostname, servicename)
        if checkinterval is None:
            logging.warning('[State Switch Worker] Missing check interval for "%s", "%s". Are you sure these names are correct ?', hostname, servicename)
        events = self.__get_influx_hard_states(
            from_time,
            hostname,
            '__host__' if servicename is None else servicename)
        los = StateSwitchWorker.__create_los_from_events(events, from_time)

        # Send the data to R
        outputs = {'FR': None, 'F': None, 'M': None, 'TM': None}
        if self.helper.run_r_script(PredictionHelper.generate_r_path('stateswitch.r'), {'LOS': PredictionValue('int', los)}, outputs):
            if outputs['M'] is None:
                outputs['M'] = []
            logging.debug('Outputs:')
            logging.debug('FR: %s', outputs['FR'])
            logging.debug('F: %s', outputs['F'])
            logging.debug('M: %s', outputs['M'])
            logging.debug('TM: %s', outputs['TM'])

            # Compute estimated transition times. Have them to be -1 if R could not compute
            if from_id in outputs['M']:
                logging.debug('Done, but no result in result set')
                return None
            else:
                # Convert the result from "number of data points" (1 data point / minute) to seconds
                result = outputs['F'][from_id - 1] + outputs['F'][from_id + 2] + outputs['F'][from_id + 5]
                return int(round(result)) * 60

    def __get_influx_hard_states(self, from_timestamp, host=None, service=None, state=None):
        """
        Gets a list of hard state changes in the specified interval, from InfluxDB.
        """
        client = self.helper.get_influx_client()
        sql = "SELECT time, state, service_description, host_name FROM EVENT where time > {}s AND state_type='HARD'".format(int(from_timestamp))
        if host is not None:
            sql += " AND host_name='{}'".format(host)
        if service is not None:
            sql += " AND service_description='{}'".format(service)
        if state is not None:
            sql += " AND state='{}'".format(state)
        logging.debug("Influx query: %s", sql)
        raw = client.query(sql, epoch='s')
        # TODO : Make StateSwitch.__create_los_from_events compatible with generators
        # so we don't have to turn the result into a list
        result = []
        for evt in raw.get_points():
            state = 0
            if evt['state'] == 'WARNING':
                state = 1
            elif evt['state'] == 'CRITICAL':
                state = 3
            result.append({
                'time': evt['time'],
                'state': state
            })
        return result

    @staticmethod
    def __create_los_from_events(events, from_time):
        """
        Takes one point every minute from the provided events list.
        """
        now = time.time()
        los = []
        last_state = 0

        event_ptr = 0
        while from_time < now:
            while event_ptr < len(events) and events[event_ptr]['time'] < from_time:
                last_state = events[event_ptr]['state']
                event_ptr += 1
            los.append(last_state)
            from_time += 60

        return los

    @staticmethod
    def __get_checkinterval(hname, sname=None):
        if sname is None:
            query = livestatus.hosts._query
            query = query.columns(*['check_interval'])
            query = query.filter('name = ' + hname)
        else:
            query = livestatus.services._query
            query = query.columns('check_interval')
            query = query.filter('description = ' + sname)
            query = query.filter('host_name = ' + hname)

        result = query.call()
        if len(result) == 0:
            return None

        return result[0]['check_interval']
