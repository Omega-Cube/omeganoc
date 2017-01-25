"""
Contains the base classes for prediction processes
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
import Queue as queue # dammit python 2!
import sqlite3
import time
import traceback

from multiprocessing import Process, Value, Queue

from prediction_helper import PredictionHelper

class PredictionOperation(object):
    """
    Defines a prediction operation that executes on a single probe, and returns
    its results as a number
    """
    def __init__(self):
        super(PredictionOperation, self).__init__()
        self.helper = PredictionHelper()

    def initialize(self, influx_info):
        self.helper.initialize(influx_info)

    def run(self, hostname, service, timeout, data_length, **kwargs):
        """
        Executes a predictive algorithm on a single specified probe, and returns a number
        representing a predicted value. (but that is most likely to change in the future)
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
        """
        Abstract method containing the logic executed when run() is called.
        """
        pass

class PredictionBatch(Process):
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

        self.helper = PredictionHelper()

    def initialize(self, previous_worker, db_path, influx_info):
        """
        Called by the module just before it's ready to use this instance.
        The previous_worker parameter may contain the worker instance that was
        executed just before that one. It can be used to pass values between
        consecutive runs.
        """
        self.helper.initialize(influx_info)
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