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

import ConfigParser
import logging
import multiprocessing
import os.path
import signal
import sys
import threading
import time
import traceback

import importlib
from daemon import DaemonContext
from lockfile.pidlockfile import PIDLockFile


conf_file_path = '/etc/nanto.cfg'
log_file_path = '/var/log/nanto.log'
lock_file_path = '/var/run/nanto.pid'
current_app = None # Will contain the currently running app instance
current_context = None
    
class InfluxConfigurationException(Exception):
    """ An exception raised when the InfluxDB configuration has a problem """
    def __init__(self, message):
        self.message = message
    def __str__(self):
        return self.message

class Nanto(object):
    """ 
    This class implements the prediction module that runs statistical analysis on 
    historical data at regular intervals.
    
    Note that as of now the module could have been implemented as a simple separated daemon
    since we actually don't communicate with the broker. Be we may need to do that later. 
    We'll see...
    """
    def __init__(self, modconf):
        logging.info('Initializing Nanto')
        # CONFIG
        self.debug_worker = modconf.get('debug_worker', None)
        logging.debug('debug_worker is {0}'.format(self.debug_worker))
        # Determines the amount of time we'll wait before running a worker again after it crashed
        self.error_interval = modconf.get('error_interval', 600) 
        logging.debug('error_interval is {0}'.format(self.error_interval))
        # Folder in which we'll store all the data
        self.storage = modconf.get('database_file', '/var/log/shinken/nanto.db')
        logging.debug('storage is {0}'.format(self.storage))
        #InfluxDB connection information
        self.influx_info = {
            'host': modconf.get('influx_host', None),
            'port': modconf.get('influx_port', None),
            'database': modconf.get('influx_database', None),
            'username': modconf.get('influx_username', None),
            'password': modconf.get('influx_password', None)
        }
        logging.debug('influx_host is {0}'.format(self.influx_info['host']))
        logging.debug('influx_port is {0}'.format(self.influx_info['port']))
        logging.debug('influx_database is {0}'.format(self.influx_info['database']))

        # Parse the workers list
        self.workers = modconf.get('workers', '')
        self.workers = [w.strip() for w in self.workers.split(',')]
        logging.debug('workers is {0}'.format(self.workers))
        
        self.worker_containers = []

    def main(self):
        logging.info('Starting nanto')
        self.__validate_influx_config()
        self.__register_default_prediction_systems()

        logging.debug('[nanto] Starting with {0} workers registered. The time is {1}'.format(len(self.worker_containers), time.time()))

        self.run = True

        while self.run:
            # Breathe
            time.sleep(10)
            # Check workers
            for wc in self.worker_containers:
                wc.check()

        logging.debug('[nanto] Stopped')

    def __register_default_prediction_systems(self):
        """ 
        Create instances of the statistical modules that will run at regular intervals,
        and fill the worker_containers field with them.
        """
        for w in self.workers:
            # Try loading that worker
            modulename = w.lower() + '_worker'
            try:
                mod = importlib.import_module(modulename)
            except Exception as err:
                logging.warning('[nanto] Could not load worker module {0} because: {1}'.format(modulename, err))
                continue
            
            typename = w + 'Worker'
            try:
                type = getattr(mod, typename)
            except AttributeError:
                logging.warning('[nanto] Could not find the worker class {0} in the module {1}'.format(typename, modulename))
                continue
            
            logging.debug('[nanto] Loaded worker ' + w)
            
            self.worker_containers.append(PredictionWorkerContainer(type, self))
        
    def __validate_influx_config(self):
        """
        Throws an error if an elements of the InfluxDB configuration is missing or invalid
        """
        missing = []
        if self.influx_info['host'] is None:
            missing.append('INFLUX_HOST')
        if self.influx_info['port'] is None:
            missing.append('INFLUX_PORT')
        if self.influx_info['database'] is None:
            missing.append('INFLUX_DATABASE')
        if self.influx_info['username'] is None:
            missing.append('INFLUX_USERNAME')
        if self.influx_info['password'] is None:
            missing.append('INFLUX_PASSWORD')
        if len(missing) > 0:
            raise InfluxConfigurationException('Missing InfluxDB configuration directives: ' + ', '.join(missing))

        try:
            self.influx_info['port'] = int(self.influx_info['port'])
        except ValueError:
            raise InfluxConfigurationException('The current configuration value for INFLUX_PORT ("{}") is not a valid number'.format(port))
        logging.debug('InfluxDB configuration is valid')

    def stop(self):
        logging.info('Stopping Nanto')
        self.run = False
        # Cancel all currently running workers
        for w in self.worker_containers:
            if w.is_running:
                w.cancel()

class PredictionWorkerContainer(object):
    """ This class wraps the statistical modules, initializes them, schedules them, and runs them """
    def __init__(self, worker_class, container):
        logging.debug('[nanto] Preparing worker {0}'.format(worker_class.__name__))
        self.worker_class = worker_class
        self.worker_instance = None
        self.is_running = False
        self.container = container # The ONocPredict module that contains this container instance
        self.create_new_worker()

    def create_new_worker(self):
        """
        Creates a new instance of the statistical module class, and computes when the next run should happen
        """
        previous_worker = self.worker_instance
        previous_time = time.time()
        if previous_worker is not None:
            logging.debug('[nanto] previous time ' + str(previous_worker.last_execution_time.value))
            previous_time = previous_worker.last_execution_time.value

        self.worker_instance = self.worker_class()
        self.worker_instance.initialize(previous_worker, self.container.storage, self.container.influx_info)

        if previous_worker is not None and previous_worker.run_exception is not None:
            # Previous run ended up on an error.
            # Schedule the next run using the "retry" interval
            self.next_run_time = previous_time + self.container.error_interval
        elif previous_worker is None and self.container.debug_worker == self.worker_class.__name__:
            # Start now (on first run) to see if all goes well
            logging.debug('[nanto] Kick starting worker {0}'.format(self.container.debug_worker))
            self.next_run_time = time.time() # Start immediately
        elif previous_worker is None:
            # Normal first run
            self.next_run_time = time.time() + self.worker_instance.compute_interval
        else:
            # Following runs
            self.next_run_time = previous_time + self.worker_instance.compute_interval
        logging.debug('[nanto] Planned next run of {0} ({2}) at {1}'.format(self.worker_class.__name__, self.next_run_time, self.worker_instance.compute_interval))

    def check(self):
        """Checks if this instance's module should start running, and starts it if it's the case"""
        if self.is_running:
            # If the worker was running we should check if it's not already finished
            if not self.worker_instance.is_alive():
                self.create_new_worker() # Create a new worker instance (can't run twice the same Process instance) and update the next run time
                self.is_running = False
                logging.info('[nanto] Worker {0} done after running for {2} seconds. Next run planned at {1}'.format(self.worker_class.__name__, self.next_run_time, time.time() - self.start_time))
            return

        if self.next_run_time < time.time():
            # Run the worker now !
            logging.info('[nanto] Starting worker {0}'.format(self.worker_class.__name__))
            # A few notes on the execution model :
            # - The computations we start here may be very resource-intensive
            #   and can take a lot of time (potentially several hours) to complete.
            #   Of course real-time performance is not a concern at this point.
            # - The computation are not done on threads but on separate processes, 
            #   which allows for a better isolation of the main loop from the
            #   potentially very high performance requirements of the modules we
            #   will execute. (expecially since CPython will actually not execute
            #   two threads simultaneously)
            # - We do not use a process pool because the typical time span between
            #   two runs will vary between one hour and one week (maybe even one
            #   month ?). Because of this and because we don't need split-second 
            #   reactivity, I don't thing having a pool with mostly idle processes
            #   is a good idea.
            self.is_running = True
            self.start_time = time.time()
            self.worker_instance.start()
            
    def cancel(self):
        if self.worker_instance is not None:
            self.worker_instance.cancel()
            
def halt(signum, frame):
    global current_app
    global current_context
    logging.debug('A signal asked us to exit! ({0})'.format(signum))
    if current_app is not None:
        try:
            current_app.stop()
        except Exception as ex:
            logging.error('An error occured while stopping the daemon: ' + str(ex))
    if current_context is not None:
        current_context.terminate(signum, frame)
            
def run():
    global current_app
    global current_context
    # Read configuration
    conf = ConfigParser.SafeConfigParser()
    readlist = conf.read(conf_file_path)
    if len(readlist) != 1:
        logging.critical('Could not read the configuration file ({})'.format(conf_file_path))
        sys.exit(1)
        return 1
    try:
        confitems = conf.items('nanto')
    except ConfigParser.NoSectionError as ex:
        logging.critical('The configuration file does not contain a Nanto section')
        sys.exit(2)
        return 2
    confdict = {key: value for key, value in confitems}

    # Configure logging
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler = logging.FileHandler(log_file_path)
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    # Configure daemon
    current_context = DaemonContext(
        files_preserve = [handler.stream],
        pidfile = PIDLockFile(lock_file_path),
        umask = 0o002,
        working_directory = os.path.dirname(os.path.abspath(__file__))
    )
    
    current_context.signal_map = {
        signal.SIGTERM: halt,
        signal.SIGHUP: halt
    }
    
    try:
        current_app = Nanto(confdict)
        with current_context:
            current_app.main()
    except Exception as ex:
        logging.error('An error occured in the daemon logic: ' + str(ex))
    return 0
    
if __name__ == '__main__':
    run()