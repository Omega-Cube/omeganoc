#!/usr/bin/env python

"""
This small scripts checks if a Shinken restart is required, and runs the necessary commands if needed
It MUST be launched with enough permissions to restart a service (usually root permissions)
"""

import logging
import logging.config
import os
import subprocess
import time
import sys

import sqlite3

from mplock import monitor_lock, FLockManager

refresh_signal_path = '/tmp/shinken_update.signal'
copy_command = 'cp -R --no-preserve=ownership,mode,timestamps /tmp/waiting/shinken /etc/ && rm -Rf /tmp/waiting/shinken'
restart_command = 'service shinken restart'
logging_file = '/var/log/hokuto.log'
hokuto_lock = '/tmp/hokuto_shinken_conf.lock'
migration_file = '/tmp/waiting/shinken/migrate.txt'
service_migration_file = '/tmp/service_migration_list.txt'
livestatus_log_dir = '/var/log/shinken/archives'

_logging_configured = False

def main():
    # This lock manager will prevent other processes from doing
    # anything while Shinken is restarting
    with FLockManager(monitor_lock):
        # Check whether a restart is required
        if os.path.isfile(refresh_signal_path):
            # Yup, restart required
            output_name = logging_file
            #migrate files
            if os.path.isfile(migration_file):
                try:
                    migrate_hosts = [];
                    migrate_services = [];
                    with open(migration_file) as f:
                        for line in f:
                            migrate = line.rstrip().split('|')
                            objtype = migrate[0]
                            path = migrate[1]
                            old = migrate[2]
                            new = migrate[3]
                            if(objtype == 'host'):
                                migrate_hosts.append((path+old,path+new))
                                migrateLogs(old,new)
                            else:
                                migrate_services.append((path+old,path+new))

                    #Migrate host probe data
                    mainLogger = getLogger()
                    for h in migrate_hosts:
                        mainLogger.info("Moving "+h[0]+" to "+h[1])
                        pcode = subprocess.call(['mv', h[0], h[1]])
                        if pcode:
                            mainLogger.error("Can't move "+(h[0])+' to '+(h[1]))
                    #Migrate service data
                    for h in migrate_services:
                        mainLogger.info("Moving "+h[0]+" to "+h[1])
                        pcode = subprocess.call(['mv', h[0], h[1]])
                        if pcode:
                            mainLogger.error("Can't move "+(h[0])+' to '+(h[1]))
                except Exception, er:
                    e = sys.exc_info()
                    mainLogger.error("[WATCHER] Oops, something bad happened while migrating data\n"+str(e))
                finally:
                    open(migration_file, 'w').close()

            #copy the configuration
            with open(output_name, 'a') as output:
                process = subprocess.Popen(copy_command, shell=True, stdout=output, stderr=output)
                process.wait()
            if process.returncode == 0:
                # copy done successfully
                getLogger().info('Successfully copy new configuration from /tmp/waiting/shinken')
                with open(output_name, 'a') as output:
                    process = subprocess.Popen(restart_command, shell=True, stdout=output, stderr=output)
                    process.wait()
                if process.returncode == 0:
                    # Restart done successfully
                    os.remove(refresh_signal_path)
                    os.remove(hokuto_lock)
                    getLogger().info('Successfully restarted Shinken')
                else:
                    mainLogger.error('Restart failed, and returned code {0}'.format(process.returncode))
            else:
                mainLogger.error('Copy failed, and returned code {0}'.format(process.returncode))


def migrateLogs(old,new):
    """ Update host_name and service description in logs database files """
    #get all archives files
    mainLogger = getLogger()
    archives_db = sorted([ f for f in os.listdir(livestatus_log_dir) if os.path.isfile(os.path.join(livestatus_log_dir,f)) \
              and f.split('.')[-1] == 'db' \
              and f.split('-')[0] == 'livelogs'])
    for db in archives_db:
        conn = sqlite3.connect(os.path.join(livestatus_log_dir,db))
        c = conn.cursor()
        c.execute("UPDATE logs SET host_name='"+new+"' WHERE host_name = '"+old+"';")
        conn.commit()

def getLogger():
    if not _logging_configured:
        # TODO: retrieve current shinken debug level
        logging.basicConfig(filename=logging_file, level=logging.INFO)
    return logging.getLogger(__name__)

if __name__ == '__main__':
    main()
