#!/usr/bin/python

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

import abc
import logging
import os
import Queue as queue # dammit python 2!
import sqlite3
import time
import traceback

from multiprocessing import Process, Value, Queue

from graphitequery import storage, query

from on_reader.livestatus import livestatus, get_all_hosts

class PredictionValueTypeException(Exception):
    """ Thrown when we cannot convert a value from R to python """
    def __init__(self, type):
        self.message = 'The R type "{0}" is unknown or not supported'.format(type)

class PredictionWorker(Process):
    """ Abstract base class for statistical modules (a.k.a. workers) """
    __metaclass__ = abc.ABCMeta

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
        super(PredictionWorker, self).__init__()
        self.compute_interval = compute_interval
        self.data_name = data_name
        self.data_version = data_version
        self.run_exception = None # This member will be filled with any unmanaged exception that is cought in the run method
        self.last_execution_time = Value('d', 0.0)
        
        # Shared
        self.messages = Queue()
        
        # Worker process state
        self.__cancel_requested = False
        
    def initialize(self, previous_worker, db_path):
        """
        Called by the module just before it's ready to use this instance.
        The previous_worker parameter may contain the worker instance that was 
        executed just before that one. It can be used to pass values between
        consecutive runs.
        """
        self.database_file = db_path
        pass

    def start(self):
        return super(PredictionWorker, self).start()

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
                logging.debug('{0}: {1}'.format(ikey, ival))
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
            na_value = ri.NAIntegerType() # I guess that's correct ? That should probably be tested though
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
        return value is ri.NA_Integer or value is ri.NA_Real or value is ri.NA_Logical or value is ri.NA_Character

    @abc.abstractmethod
    def internal_run(self):
        """
        This method should be implemented by subclasses to contain the code specific to their particular prediction algorithm
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

    @staticmethod
    def generate_r_path(file_name):
        """
        Takes the name of an R file as a parameter and returns the 
        full path to it (if it's located into the standard R files directory)
        """
        return os.path.join(os.path.dirname(os.path.realpath(__file__)), file_name)

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

    # GRAPHITE TOOLS for use by child classes
    @staticmethod
    def get_graphite_metrics():
        """Returns a list of metrics on which we will can get data from Graphite"""
        result = []
        PredictionWorker.__parseMetrics('*', storage.Store(), result)
        return result

    @staticmethod
    def __parseMetrics(query, store, results):
        metrics= store.find(query)
        for m in metrics:
            if m.is_leaf:
                results.append(m.path)
            else:
                PredictionWorker.__parseMetrics(m.path + '.*', store, results)
        return results

    @staticmethod
    def get_graphite_data(metric_name, from_hours, remove_nones = True, expand = False):
        """ 
        Returns the data stored in graphite for the period between now and N hours ago

        If expand is True, then the function will add None values to fill areas of time that 
        are required but not returned by Graphite

        If remove_nones is True, the all None values in the series will be replaced by the previous value.
        If the first value is None, it will be set to zero.

        The function returns a set containing :
        - The step interval (in seconds)
        - The list of values
        If no data was found, the step will be 0 and the values will be an empty list

        """
        now = time.time()

        results = query.query(target=metric_name, from_time='-' + str(from_hours) + 'h')

        if len(results):
            data = results[0].getInfo()['values']
            step = results[0].step
            end_data = results[0].end
            start_data = results[0].start   
        else:
            # TODO : No data found for this target... What do ?
            data = []
            step = 0
            end_data = 0
            start_data = 0

        if len(data) > 0 and expand:
            end_ts = now
            start_ts = now - (from_hours * 3600)

            start_diff = start_data - start_ts
            end_diff = end_ts - end_data

            start_diff = int(start_diff / step)
            end_diff = int(end_diff / step)

            if start_diff > 0:
                data = [None for i in xrange(start_diff)] + data
                start_data -= (start_diff * step)

            if end_diff > 0:
                data = data  + [None for i in xrange(end_diff)]
                end_data += (end_diff * step)

        if remove_nones:
            # So we have to get sure that no unknown value is left in the data
            # TODO : Make sure that the array returned enough values to cover the entire requested period
            last_state = 0
            for i in xrange(len(data)):
                if data[i] is None:
                    data[i] = last_state
                else:
                    last_state = data[i]

        return (start_data, end_data, step, data)

    @staticmethod
    def change_graphite_name_to_livestatus(metric_name):
        """
        Converts a component name from graphite conventions to livestatus conventions
        """
        parts = metric_name.split('.')
        return (parts[0], parts[1])

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

    @staticmethod
    def get_livestatus_hard_states(from_timestamp, host = None, service = None, state = None):
        """
        Gets a list of hard state changes in the specified time interval.
        """
        query = livestatus.log._query

        query = query.columns(*['time', 'host_name', 'service_description', 'state'])
        query = query.filter('class = 1')
        query = query.filter('state_type = HARD')
        query = query.filter('time > {:.0f}'.format(from_timestamp))
        if host is not None:
            query = query.filter('host_name = ' + host)
        if service is not None:
            query = query.filter('service_description = ' + service) 

        if state is not None:
            query = query.filter('state = {0}'.format(state))

        return query.call()

    # MISC tools

    @staticmethod
    def frange(start, stop, step = 1):
        """
        Works just like the standard range(), but returns floats instead of ints
        """
        if step <= 0:
            raise ValueError('Invalid range ({0})'.format(step))
        while start < stop:
            yield start
            start += step


class PredictionValue(object):
    """ A wrapper for values sent to R """
    def __init__(self, type, value):
        """
        Creates a new R value
        
        type is a string describing the target R type of the value. Possible type values are:
        bool, byte, float, int or string
        
        value is the actual value that should be converted and sent
        """
        self.type = type
        self.value = value

    def __repr__(self):
        return str(self.value)

    def __str__(self):
        return str(self.value)
