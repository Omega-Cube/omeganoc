import logging
import random
import time

from on_reader.livestatus import livestatus

from prediction_worker import PredictionOperation, PredictionWorker, PredictionValue

class FromValueException(Exception):
    """ Thrown when we receive an incorrect value in the 'from' parameter """
    def __init__(self, received_value):
        super(FromValueException, self).__init__()
        self.message = 'Invalid value for the "from" parameter: {}'.format(received_value)

class StateSwitchWorker(PredictionOperation):
    def __init__(self):
        # This script runs every hour
        super(StateSwitchWorker, self).__init__()
        self.states_length = (3600 * 24 * 30) # Take one month of history into account

    def internal_run(self, hostname, servicename, timeout, **kwargs):
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

        # Read
        from_time = time.time() - self.states_length

        # To avoid having bajillions of values we'll handle only one list of states at a time
        # One state / minute, which is a lot over one month but allows us to be compatible with any
        # possible check interval
        checkinterval = StateSwitchWorker.__get_checkinterval(hostname, servicename)
        if checkinterval is None:
            logging.debug('[State Switch Worker] Missing check interval for {0}, {1}. Are you sure these names are correct ?'.format(hostname, servicename))
        events = PredictionWorker.get_livestatus_hard_states(
            from_time,
            hostname,
            '' if servicename is None else servicename)
        los = StateSwitchWorker.__create_los_from_events(events, from_time)
        logging.debug("================================")
        logging.debug("%s", events)
        logging.debug("================================")

        # Send the data to R
        outputs = {'FR': None, 'F': None, 'M': None, 'TM': None}
        if self.run_r_script(PredictionWorker.generate_r_path('stateswitch.r'), {'LOS': PredictionValue('int', los)}, outputs):
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
                return int(round(outputs['F'][from_id - 1] + outputs['F'][from_id + 2] + outputs['F'][from_id + 5])) * 60

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
    def __get_checkinterval(hname, sname = None):
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
