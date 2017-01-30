"""
Implements an algorithm that detects changes of behavior
in telemetry data
"""

import datetime
import logging
import time
import traceback

from prediction_worker import PredictionBatch
from prediction_helper import PredictionValue, PredictionHelper

class ChangepointWorker(PredictionBatch):
    """
    Implements an algorithm that detects changes of behavior
    in telemetry data
    """
    def __init__(self):
        # The worker runs every 3 hours
        super(ChangepointWorker, self).__init__(10800, 'changepoint', 1)

        # That setting is pretty important, because there is a small risk that changepoint
        # data older than this amount of time is incorrect.
        # This is because if the algorithm changes its results in the oldest area of the
        # working time window (compared to the previous run), points could be duplicated
        # or removed if they move over the window limit.
        self.period_length = 10 # in days


    def internal_run(self):
        components = self.get_targets_list()
        logging.debug('About to run changepoint on %s components', len(components))
        t0 = time.time()
        for c in components:
            success = False
            try:
                (start, _, step, values) = self.helper.get_metrics_data(
                    c['hostname'],
                    c['servicename'],
                    c['probename'],
                    self.period_length * 24,
                    True,
                    False)

                if len(values) == 0:
                    #No data found. This may happen after a service gets removed
                    logging.debug("[Changepoint] No data found for host '%s', service '%s', metric '%s'; skipping.",
                                  c['hostname'],
                                  c['servicename'],
                                  c['probename'])
                    continue

                # Eliminate negative values from the set
                values = ChangepointWorker.__get_abs_values(values)

                # Send the values to R
                inputs = {'iData': PredictionValue('float', values)}

                outputs = {'cpList': None}

                if self.helper.run_r_script(PredictionHelper.generate_r_path('changepoint.r'), inputs, outputs):
                    with self.get_database() as con:
                        # It seems that the changepoint lib includes the final index
                        # at the end of its results list for some reason ?
                        self.__create_events(c['hostname'], c['servicename'], c['probename'], outputs['cpList'][0:-1], self.period_length, start, step)
                        #result = ';'.join([str(start + (i * step)) for i in outputs['cpList'][0:-1]])
                        #con.execute('INSERT OR REPLACE INTO changepoint (probe, update_time, points, checked) VALUES (?, ?, ?, ?)',
                        #            (c, time.time(), result, 0))

                    success = True
            except Exception, ex:
                logging.warning('[Changepoint worker] An exception occured while computing the changepoint predictions for component {0}: {1}'.format(c, ex.message))
                logging.debug('[Changepoint worker] Exception details: ' + traceback.format_exc())
            if not success:
                # There is no available data at all... Clear the computed time window
                self.__create_events(c['hostname'],
                                     c['servicename'],
                                     c['probename'],
                                     None,
                                     self.period_length,
                                     0,
                                     0)
                #with self.get_database() as con:
                #    con.execute('INSERT OR REPLACE INTO ecdf (probe, update_time, intervals, probabilities, lower_95, upper_95) VALUES (?, ?, ?, ?, ?, ?)',
                #                (c, time.time(), None, None, None, None))

        t1 = time.time()
        ttl = t1 - t0
        logging.debug('Entire changepoint ({0} entries) in {1}s ({2}s / entry)'.format(len(components), ttl, ttl / len(components)))

    def updatedb(self, currentversion, connection):
        # if currentversion < 1:
        #     connection.execute('CREATE TABLE changepoint (probe VARCHAR(512) NOT NULL PRIMARY KEY,\
        #                                                  update_time INT NOT NULL,\
        #                                                  points VARCHAR(256) NOT NULL,\
        #                                                  checked BOOLEAN NOT NULL)') # Initially False, set to True when shinken checks the contents for alert material
        #                                                                              # Useful to avoid triggering alerts twice
        pass

    def get_targets_list(self):
        """
        Returns a list of metrology probes available in the database,
        in the form of an array of {hostname:..., servicename:..., probename:...}
        """
        result = []
        client = self.helper.get_influx_client()
        # We can extract all the information we need from the series list
        serieslist = client.query('show series')
        for series in serieslist.get_points():
            # Parse the series key, which come in the form
            # "<measurement>,<tag_name>=<value>,<tag_name>=<value>,..."
            key = series['key']
            keyparts = key.split(',')
            logging.debug('evaluating %s', keyparts[0])
            if not keyparts[0].startswith('metric_'):
                logging.debug('not a metric')
                continue # Not a metric
            logging.debug('key is %s', key)
            probename = keyparts[0][7:]
            servicedescription = None
            hostname = None
            for strtag in keyparts[1:]:
                # We have to remove backward slashes in front of spaces in tag values
                tagparts = strtag.split('=')
                logging.debug('tag entry %s', tagparts)
                if tagparts[0] == 'host_name':
                    hostname = tagparts[1].replace('\\ ', ' ')
                if tagparts[0] == 'service_description':
                    servicedescription = tagparts[1].replace('\\ ', ' ')
            if hostname and servicedescription:
                logging.debug('Added')
                result.append({
                    'hostname': hostname,
                    'servicename': servicedescription,
                    'probename': probename
                })
            else:
                logging.debug('Not enough data')
        logging.debug('[Changepoint] Targets list: %s', result)
        return result


        #return PredictionWorker.get_graphite_metrics()[:10]

        # with self.get_database() as con:
        #     # Check if the table exists. If not it means that nothing was added yet
        #     con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='changepoint_targets'")
        #     t = con.fetchone()
        #     if t is None:
        #         return []

        #     #Table exists. Read it
        #     return [row[0] for row in con.execute('SELECT name FROM changepoint_targets')]

    @staticmethod
    def __get_abs_values(original_values):
        """
        Turns a list of numbers into a list of strictly positive numbers
        by incrementing all of them by the same number.
        """
        lowest_value = 0
        for i in original_values:
            if i < lowest_value:
                lowest_value = i
        if lowest_value == 0:
            # No change needed
            return original_values
        else:
            # Shift the list
            # No iterator since we'll send that list to R directly
            return [i - lowest_value for i in original_values]

    def __create_events(self, hostname, service_description, probename, events, data_age, start, step):
        conn = self.helper.get_influx_client()
        # Remove all events in the area we want to update, to avoid creating duplicates
        conn.query("DELETE FROM Changepoints WHERE host_name='{}' AND service_description='{}' AND probe_name='{}' AND time > now() - {}d".format(hostname, service_description, probename, data_age))
        if events is not None:
            logging.debug("Inserting %s events", len(events))
            # Insert events
            events = [{
                "measurement": "Changepoints",
                "tags": {
                    "host_name": hostname,
                    "service_description": service_description,
                    "probe_name": probename
                },
                "time": datetime.datetime.fromtimestamp(start + (i * step)).isoformat(),
                "fields": {
                    "val": 1
                }
            } for i in events]
            conn.write_points(events)
