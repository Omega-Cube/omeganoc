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

from mplock import monitor_lock, FLockManager

refresh_signal_path = '/tmp/shinken_update.signal'
copy_command = 'cp -R --no-preserve=ownership,mode,timestamps /tmp/waiting/shinken /etc/ && rm -Rf /tmp/waiting/shinken'
restart_command = 'service shinken restart'
logging_file = '/var/log/shinken/hokuto.log'
hokuto_lock = '/tmp/hokuto_shinken_conf.lock'

_logging_configured = False

def main():
    # This lock manager will prevent other processes from doing
    # anything while Shinken is restarting
    with FLockManager(monitor_lock):
        # Check whether a restart is required
        if os.path.isfile(refresh_signal_path):
            # Yup, restart required
            output_name = logging_file
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
                    os.remove(output_name)
                    os.remove(hokuto_lock)
                    getLogger().info('Successfully restarted Shinken')
                else:
                    mainlogger = getLogger()
                    mainlogger.error('Restart failed, and returned code {0}'.format(process.returncode))
            else:
                mainlogger = getLogger()
                mainlogger.error('Copy failed, and returned code {0}'.format(process.returncode))


def getLogger():
    if not _logging_configured:
        # TODO: retrieve current shinken debug level
        logging.basicConfig(filename=logging_file, level=logging.INFO)
    return logging.getLogger(__name__)

if __name__ == '__main__':
    main()
