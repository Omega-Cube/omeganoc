"""
Implementation of the Timewindow prediction algorithm
It tries to look at past prefdata for the known probes,
and predicts what that perfdata could look like in the future.
"""

# -*- coding: utf-8 -*-

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
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
import os
import time
import traceback

from prediction_worker import PredictionBatch, PredictionWorker, PredictionValue
from on_reader.livestatus import livestatus


class TimewindowWorker(PredictionBatch):
    """
    This worker tries to produce an estimate of how a value will behave
    in a near future, based on the last month of values
    """
    def __init__(self):
        # The worker runs every 2 hours
        super(TimewindowWorker, self).__init__(7200, 'timewindow', 2)
        self.history_points_count = 30*24 # 1 month
        self.predicted_points = 6

    def internal_run(self):
        components = self.get_metrics_structure()
        logging.debug('[nanto:timewindow] About to run timewindow prediction on {0} hosts'.format(len(components)))
        logging.debug('[nanto:timewindow] On process {0}'.format(os.getpid()))
        t0 = time.time()
        entries_count = 0
        for h in components:
            host = components[h]
            for s in host:
                service = host[s]
                for metric in service:
                    if self.should_cancel():
                        logging.info('[nanto:timewindow] Cancelling')
                        return
                    entries_count += 1
                    success = False
                    checkinterval = 3600 # For now we'll only consider one value/hour
                    try:
                        success = self.__go(h, s, metric, checkinterval)
                    except Exception, ex:
                        logging.warning('[nanto:timewindow]  An exception occured while computing the timewindow predictions for host "{1}", service "{2}", metric "{3}": {0}'.format(ex.message, h, s, metric))
                        logging.debug('[nanto:timewindow]  Exception details: ' + traceback.format_exc())
                    if not success:
                        # There is no available data at all... Set the prediction value to NULL
                        with self.get_database() as con:
                            con.execute('INSERT OR REPLACE INTO timewindow (probe, update_time, start_time, step, mean, lower_80, lower_95, upper_80, upper_95) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                        ('{}.{}.{}'.format(h, s, metric), time.time(), None, None, None, None, None, None, None))
        t1 = time.time()
        ttl = t1 - t0
        logging.debug('[nanto:timewindow] Entire timewindow ({0} entries) in {1}s ({2}s / entry)'.format(entries_count, ttl, ttl / entries_count))
        
    def __go(self, host, service, metric, checkinterval):
        now = time.time()
        target = '{}.{}.{}'.format(host, service, metric)
        (start, end, step, values) = self.get_metrics_data(host, service, metric, checkinterval * self.history_points_count / 3600, False, True)

        # Change the time series granularity so that we have the one required by the R script
        normalized_values = []
        dstpos = 0
        lastval = 0
        for srcpos in xrange(len(values)):
            if values[srcpos] is not None:
                lastval = values[srcpos]

            while (srcpos * step) >= (dstpos * checkinterval):
                normalized_values.append(lastval)
                dstpos += 1

        logging.debug('[nanto:timewindow] Found {0} data points for host "{1}", service "{2}", metric "{3}"'.format(
            len(normalized_values), host, service, metric))
        # Check that we actually have enough data
        if len(normalized_values) < 300:
            logging.info('[nanto:timewindow]  Skipped time series on {1}.{2}.{3}: not enough data ({0} points)'.format(
                len(normalized_values), host, service, metric))
            self.save_error(target, "There is not enough data to have make accurate predictions")
            return False


        # Send the values to R
        inputs = {'iData': PredictionValue('float', normalized_values),
                  'iTwPoints': PredictionValue('int', 300),
                  'iOutputLength': PredictionValue('int', 6)}

        outputs = {'pred_mean': None, 'pred_lower': None, 'pred_upper': None}

        if self.run_r_script(PredictionWorker.generate_r_path('timewindow.r'), inputs, outputs):
            valcount = len(outputs['pred_mean'])
            mean = ';'.join([str(i) for i in outputs['pred_mean']])
            lower_80 = ';'.join([str(i) for i in outputs['pred_lower'][:valcount]])
            lower_95 = ';'.join([str(i) for i in outputs['pred_lower'][valcount:]])
            upper_80 = ';'.join([str(i) for i in outputs['pred_upper'][:valcount]])
            upper_95 = ';'.join([str(i) for i in outputs['pred_upper'][valcount:]])

            with self.get_database() as con:
                con.execute('INSERT OR REPLACE INTO timewindow (probe, update_time, error_desc, start_time, step, mean, lower_80, lower_95, upper_80, upper_95) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            (target, time.time(), None, end + checkinterval, checkinterval, mean, lower_80, lower_95, upper_80, upper_95))

            return True
        else:
            self.save_error(target, "This node could not be processed")
            return False

    def save_error(self, target, message):
        """ Saves an error to the database, and clear and existing results """
        with self.get_database() as con:
            logging.debug('Saving error message "{}" for target "{}"'.format(message, target))
            con.execute('INSERT OR REPLACE INTO timewindow (probe, update_time, error_desc, start_time, step, mean, lower_80, lower_95, upper_80, upper_95) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        (target, time.time(), message, None, None, None, None, None, None, None))

    def updatedb(self, currentversion, connection):
        if currentversion < 1:
            logging.debug('[nanto:timewindow] Creating timewindow table')
            connection.execute('CREATE TABLE IF NOT EXISTS timewindow (\
                                                         probe VARCHAR(512) NOT NULL PRIMARY KEY,\
                                                         update_time INT NOT NULL,\
                                                         start_time INT,\
                                                         step INT,\
                                                         mean VARCHAR(1024),\
                                                         lower_80 VARCHAR(1024),\
                                                         lower_95 VARCHAR(1024),\
                                                         upper_80 VARCHAR(1024),\
                                                         upper_95 VARCHAR(1024))')
            # Data can be null if forecasting is impossible with current data
        if currentversion < 2:
            # Add the error_desc column, containing a user-friendly error message
            # if for any reason we could not produce results
            connection.execute('ALTER TABLE timewindow ADD error_desc TEXT')
