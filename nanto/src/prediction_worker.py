#!/usr/bin/python

"""
Contains the base classes for prediction workers
"""

# -*- coding: utf-8 -*-

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2016 Omega Cube and contributors
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

import abc
import logging
import os
import Queue as queue # dammit python 2!
import sqlite3
import time
import traceback

from multiprocessing import Process, Value, Queue

from influxdb import InfluxDBClient

from on_reader.livestatus import livestatus, get_all_hosts

class PredictionValueTypeException(Exception):
    """ Thrown when we cannot convert a value from R to python """
    def __init__(self, valueType):
        super(PredictionValueTypeException, self).__init__()
        self.message = 'The R type "{0}" is unknown or not supported'.format(valueType)

class PredictionWorker(object):
    """ Abstract base class for statistical modules (a.k.a. workers) """
    __metaclass__ = abc.ABCMeta

    def __init__(self):
        # Host process state
        super(PredictionWorker, self).__init__()
        self.influx_info = None

    def initialize(self, influx_info):
        """
        Called by the container just before it's ready to use this instance.
        """
        self.influx_info = influx_info

    # R TOOLS for use by child classes

    @staticmethod
    def run_r_script(script_name, inputs, outputs):
        """
        Executes the specified R script

        Parameters :
        - script_name is the name of the script we should execute
        - inputs is a dict containing PredictionValue instances. Before the script
          gets executed, each entry in the dict will be injected into the R environment
          as variables (the dict key being the variable name).
        - outputs is a dict, whick contains one key per variable that should be read from
          the R environment after the script gets executed. When the R script is done the
          method will copy values from the R variables to this dict.
          Note that since R internally represent scalars as lists, all scalar values
          will be returned as lists with one element.

        The function returns True upon successful completion, or False if something went wrong.
        """
        # We import R at function level so that we load one R environment per
        # call. This way we make it possible to call several R scripts simultaneously
        # on separated threads without risking to break the R environment
        import rpy2.rinterface as ri
        from rpy2.robjects.packages import importr
        ri.initr()
        r_base = importr('base')

        with open(script_name, 'r') as r_file:
            script = r_file.read()
        try:
            r_expr = ri.parse(script)
        except Exception as ex:
            logging.error('An error occured while parsing an R script "{0}": {1}'.format(script_name, ex.message))
            return False

        # Inject inputs into R
        for key, value in inputs.iteritems():
            ri.globalenv[key] = PredictionWorker.__value_py_to_r(value, ri)

        # Execute
        try:
            r_base.eval(r_expr)
        except Exception as ex:
            logging.error('An error occured while executing the R script "{0}": {1}'.format(script_name, ex.message))
            logging.debug('Inputs:')
            for ikey, ival in inputs.iteritems():
                logging.debug('%s: %s', ikey, ival)
            return False

        # Read outputs
        for key in outputs.iterkeys():
            outputs[key] = PredictionWorker.__value_r_to_py(ri.globalenv[key], ri)

        return True

    @staticmethod
    def __value_py_to_r(value, ri):
        """Returns the R equivalent of a python value"""
        val = value.value
        if not isinstance(val, (list, tuple)):
            # Is this an iterable ?
            if hasattr(val, '__iter__') and not isinstance(val, (str, unicode)):
                val = [v for v in val]
            else:
                # In R scalar values are vectors with one element
                # So here we put the scalar value into a list
                val = [val]

        na_value = None
        if value.type == 'bool':
            na_value = ri.NALogicalType()
        elif value.type == 'byte':
            na_value = ri.NAIntegerType() # TODO: Verify
        elif value.type == 'float':
            na_value = ri.NARealType()
        elif value.type == 'int':
            na_value = ri.NAIntegerType()
        elif value.type == 'string':
            na_value = ri.NACharacterType()

        # Scan the elements to replace Nones by NA
        val = [(na_value if v is None else v) for v in val]

        if value.type == 'bool':
            return ri.BoolSexpVector(val)
        if value.type == 'byte':
            return ri.ByteSexpVector(val)
        if value.type == 'float':
            return ri.FloatSexpVector(val)
        if value.type == 'int':
            return ri.IntSexpVector(val)
        if value.type == 'string':
            return ri.StrSexpVector(val)

        raise PredictionValueTypeException(value.type)

    @staticmethod
    def __value_r_to_py(r_value, ri):
        """Returns a python equivalent of an R value"""
        if isinstance(r_value, ri.RNULLType):
            return None
        # Replace NA values with Nones
        result = [(None if PredictionWorker.__r_value_is_NA(v, ri) else v) for v in r_value]

        for i in xrange(len(result)):
            if PredictionWorker.__r_value_is_NA(result[i], ri):
                result[i] = None
            elif isinstance(result[i], ri.SexpVector):
                result[i] = PredictionWorker.__value_r_to_py(result[i], ri)

        return result

    @staticmethod
    def __r_value_is_NA(value, ri):
        return value is ri.NA_Integer or \
               value is ri.NA_Real or \
               value is ri.NA_Logical or \
               value is ri.NA_Character

    @staticmethod
    def generate_r_path(file_name):
        """
        Takes the name of an R file as a parameter and returns the
        full path to it (if it's located into the standard R files directory)
        """
        return os.path.join(os.path.dirname(os.path.realpath(__file__)), file_name)

    # METROLOGY DATA TOOLS for use by child classes
    def get_metrics_structure(self):
        """
        Returns a list of metrics available in the metrics database.
        """
        client = self.get_influx_client()
        result = {}
        tagdata = client.query('show tag values with key in ("host_name", "service_description")')
        measurements = list(PredictionWorker.__get_numeric_measurements(client))

        for m in tagdata.items():
            # Do not use non-numeric metrics
            if m[0] not in measurements:
                continue
            # Extract host and service names
            host_names = []
            for pair in m[1]:
                if pair[u'key'] == u'host_name':
                    host_names.append(pair[u'value'])
                if pair[u'key'] == u'service_description':
                    service_description = pair[u'value']

            for host_name in host_names:
                # check if the host is already in the results
                if host_name not in result:
                    result[host_name] = {}
                # Add the service into the host
                if service_description not in result[host_name]:
                    result[host_name][service_description] = []
                # Add the probe
                metric_name = m[0][0]
                if metric_name.startswith('metric_'):
                    metric_name = metric_name[7:]
                result[host_name][service_description].append(metric_name)
        return result

    def get_metrics_data(self, hostname, servicename, probename, from_hours, remove_nones=True, expand=False):
        """
        Returns the data stored in the metrics database for the period between now and N hours ago

        If expand is True, then the function will add None values to fill areas of time that
        are required but not returned by the database

        If remove_nones is True, the all None values in the series will be replaced
        by the previous value. If the first value is None, it will be set to zero.

        The function returns a set containing :
        - The step interval (in seconds)
        - The list of values
        If no data was found, the step will be 0 and the values will be an empty list

        """
        logging.debug('Data requested for host "{}", service "{}", metric "{}" on {} hours'.format(
            hostname, servicename, probename, from_hours))
        client = self.get_influx_client()
        query = "select time, value from \"{}\" where host_name='{}' and service_description='{}' and time >= now() - {}h".format(
            'metric_' + probename,
            hostname,
            servicename,
            from_hours)
        logging.debug('InfluxDB query : ' + query)
        raw = client.query(query, epoch='s')

        normalized_data = []
        # For interval detection, we will assume there are a lot of points (otherwise
        # we would not have any good prediction anyway). That way we can be confident
        # that the most encountered interval is the actual one
        intervals = {}
        previous_point = 0

        for row in raw.get_points():
            r = row['time'] % 60
            if r > 30:
                current_point = row['time'] - r + 60
            else:
                current_point = row['time'] - r
            
            normalized_data.append({'time': current_point, 'value': row['value']})

            if previous_point != 0:
                interval = current_point - previous_point
                if interval in intervals:
                    intervals[interval] += 1
                else:
                    intervals[interval] = 1

        if len(normalized_data) == 0:
            # No data
            return (0, 0, 0, [])

        # Get the actual interval
        interval_max_count = 0
        interval = 300 # Default : 5 minutes (basically this will be kept if there's only one point)
        for i in intervals:
            if intervals[i] > interval_max_count:
                interval_max_count = intervals[i]
                interval = i
        logging.debug('Detected interval: {}'.format(interval))

        # Generate the data array with one value every interval
        final_data = [normalized_data[0]['value']]
        start_time = normalized_data[0]['time']
        end_time = 0
        previous_point = start_time
        previous_value = normalized_data[0]['value']
        for point in normalized_data[1:]:
            next_point = previous_point + interval
            if point['time'] < previous_point:
                continue # Current point is in an already filled interval; skip it
            while point['time'] >= next_point:
                # An empty point !
                if remove_nones:
                    final_data.append(previous_value)
                else:
                    final_data.append(None)
                next_point += interval
            final_data.append(point['value'])
            previous_value = point['value']
            previous_point = next_point
            end_time = next_point

        # Expand ?
        if expand:
            # Expand before known data
            expanded_bound = time.time() - from_hours * 3600
            # Round to the next interval
            expanded_bound -= (expanded_bound % interval) + interval
            if remove_nones:
                while start_time >= expanded_bound:
                    final_data.insert(0, 0)
                    start_time -= interval
            else:
                while start_time >= expanded_bound:
                    final_data.insert(0, None)
                    start_time -= interval

            # Expand after known data
            expanded_bound = time.time()
            expanded_bound -= expanded_bound % interval
            if remove_nones:
                while end_time <= expanded_bound:
                    final_data.append(previous_value)
                    end_time += interval
            else:
                while end_time <= expanded_bound:
                    final_data.append(None)
                    end_time += interval
        return (start_time, end_time, interval, final_data)

    def get_influx_client(self):
        return InfluxDBClient(host=self.influx_info['host'],
                              port=self.influx_info['port'],
                              database=self.influx_info['database'],
                              username=self.influx_info['username'],
                              password=self.influx_info['password'])

    @staticmethod
    def __get_numeric_measurements(client):
        fielddata = client.query('show field keys')
        for measurement in fielddata.items():
            for field in measurement[1]:
                if field[u'fieldKey'] == u'value':
                    yield measurement[0]
                    break

    # LIVESTATUS TOOLS for use by child classes
    @staticmethod
    def get_livestatus_components():
        """
        Returns the full list of components known to Livestatus.
        The result is an array of tuples (hostname, servicename)
        in which servicename may be null to describe a host component.
        """
        result = []
        hlist = get_all_hosts()
        for hname in hlist:
            result.append((hname, None))
            for sname in hlist[hname]['services']:
                result.append((hname, sname))
        return result

    # MISC tools

    @staticmethod
    def frange(start, stop, step=1):
        """
        Works just like the standard range(), but returns floats instead of ints
        """
        if step <= 0:
            raise ValueError('Invalid range ({0})'.format(step))
        while start < stop:
            yield start
            start += step

class PredictionOperation(PredictionWorker):
    """
    Defines a prediction operation that executes on a single probe, and returns
    its results as a string
    """
    def __init__(self):
        super(PredictionOperation, self).__init__()

    def run(self, hostname, service, timeout, data_length, **kwargs):
        """
        Executes a predictive algorithm on a single specified probe, and returns a dict
        containing all the resulting values. In that dict, there should be a key "status"
        containing the return code that the process whould exit with (between 0 and 3).
        Keyword arguments depends on the algorithm itself, and contains the command line
        arguments that are not already in the other arguments.
        """
        try:
            return self.internal_run(hostname, service, timeout, data_length, **kwargs)
        except Exception as ex:
            logging.error('[nanto] An error occured inside a prediction operation ({0})'.format(type(self)))
            logging.debug('[nanto] Exception: {0}'.format(ex))
            logging.debug('[nanto] Stack: {0}'.format(traceback.format_exc()))
            return 1000

    @abc.abstractmethod
    def internal_run(self, hostname, service, timeout, data_length, **kwargs):
        pass

class PredictionBatch(Process, PredictionWorker):
    """
    Defines a prediction operation that executes on all available probes
    and saves its results in a database backend
    """
    def __init__(self, compute_interval, data_name, data_version):
        """
        Initializes a new instance of the worker.

        compute_interval contains the time to wait between two runs of this worker, in seconds
        data_name contains a string identifier for the worker. It will be used by the worker's
        data tools to associate the generated data with this worker
        data_version contains a string representing the version of the data structure used to
        store this worker's results. It is used to automatically trigger an update if necessary
        """

        # Host process state
        super(PredictionBatch, self).__init__()
        self.compute_interval = compute_interval
        self.data_name = data_name
        self.data_version = data_version
        self.run_exception = None # This member will be filled with any unmanaged exception
                                  # that is caught in the run method
        self.last_execution_time = Value('d', 0.0)

        # Shared
        self.messages = Queue()

        # Worker process state
        self.__cancel_requested = False

        self.database_file = None

    def initialize(self, previous_worker, db_path, influx_info):
        """
        Called by the module just before it's ready to use this instance.
        The previous_worker parameter may contain the worker instance that was
        executed just before that one. It can be used to pass values between
        consecutive runs.
        """
        super(PredictionBatch, self).initialize(influx_info)
        self.database_file = db_path


    def start(self):
        return super(PredictionBatch, self).start()

    def cancel(self):
        """ Used by the host to politely ask the worker to stop working ASAP
        """
        self.messages.put('cancel')

    def __process_all_queue(self):
        while self.__process_queue():
            pass

    def __process_queue(self):
        # Read next value
        try:
            val = self.messages.get_nowait()
        except queue.Empty:
            return False
        # Process value
        if val == 'cancel':
            self.__cancel_requested = True
        return True

    def should_cancel(self):
        """ Can be called from the worker process to know
            if the host asked for cancellation.
        """
        self.__process_all_queue()
        return self.__cancel_requested

    # DATABASE TOOLS for use by child classes

    def get_database(self):
        """ Returns an sqlite3 database object suitable to store results """
        try:
            result = sqlite3.connect(self.database_file)
        except Exception as ex:
            logging.error('Could not open database for a prediction module ({0}): {1}'.format(self.database_file, ex))
            raise

        # Check if the versions table exists
        cur = result.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='onoc_pred_versions'")
        if cur.fetchone() is None:
            logging.info('[nanto] No versions table! Creating...')
            # Create the versions table
            result.execute('CREATE TABLE onoc_pred_versions (worker_name VARCHAR(255) NOT NULL PRIMARY KEY, version INT NOT NULL)')

        # Check if the worker data structure is up to date
        cur.execute('SELECT version FROM onoc_pred_versions WHERE worker_name=?', (self.data_name,))
        row = cur.fetchone()
        if row is None:
            logging.debug('[nanto] No version row available for worker "{0}"; setting version to 0'.format(self.data_name))
            version = 0
        else:
            version = row[0]

        if self.data_version != version:
            logging.info('[nanto] Updating {0} database from version {1} to {2}'.format(self.data_name, version, self.data_version))
            self.updatedb(version, result)
            if version == 0:
                cur.execute('INSERT INTO onoc_pred_versions (worker_name, version) VALUES (?, ?)', (self.data_name, self.data_version))
            else:
                cur.execute('UPDATE onoc_pred_versions SET version=? WHERE worker_name=?', (self.data_version, self.data_name))

        return result

    def updatedb(self, currentversion, connection):
        """
        This method should be overriden by any child class that needs to store stuff
        into the results database (returned by get_database()). When the database is opened,
        and the structure version stored in it is different than the version specified in this
        worker instance, this method will be called to let the worker apply the necessary
        structure upgrades (create and update tables, etc...).
        """
        raise Exception("Not implemented")

    @abc.abstractmethod
    def internal_run(self):
        """
        This method should be implemented by subclasses to contain the code specific
        to their particular prediction algorithm
        """
        pass

    def run(self):
        try:
            self.internal_run()
        except Exception as ex:
            logging.error('[nanto] An error occured inside a prediction worker ({0})'.format(type(self)))
            logging.debug('[nanto] Exception: {0}'.format(ex))
            logging.debug('[nanto] Stack: {0}'.format(traceback.format_exc()))
            self.run_exception = ex
        self.last_execution_time.value = time.time()
        logging.debug('[nanto] Leaving worker run at ' + str(self.last_execution_time.value))


class PredictionValue(object):
    """ A wrapper for values sent to R """
    def __init__(self, valueType, value):
        """
        Creates a new R value

        type is a string describing the target R type of the value. Possible type values are:
        bool, byte, float, int or string

        value is the actual value that should be converted and sent
        """
        self.type = valueType
        self.value = value

    def __repr__(self):
        return str(self.value)

    def __str__(self):
        return str(self.value)
