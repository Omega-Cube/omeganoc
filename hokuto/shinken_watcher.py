#!/usr/bin/env python

"""
This small scripts checks if a Shinken restart is required, and runs the necessary commands if needed
It MUST be launched with enough permissions to restart a service (usually root permissions)
"""

import ConfigParser
import logging
import logging.config
import os
import subprocess
import sqlite3

from influxdb import InfluxDBClient

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
    # anything while we are editing the configuration and restarting Shinken
    with FLockManager(monitor_lock):
        # Check whether an update is required
        if os.path.isfile(refresh_signal_path):
            mainLogger = getLogger()
            mainLogger.info('Update started')
            output_name = logging_file
            # migrate InfluxDB data
            if os.path.isfile(migration_file):
                migrate_hosts = [];
                migrate_services = [];
                try:
                    with open(migration_file) as f:
                        for line in f:
                            migrate = line.rstrip().split('|')
                            objtype = migrate[0]
                            old = migrate[1]
                            new = migrate[2]
                            if(objtype == 'host'):
                                migrate_hosts.append((old, new))
                            else:
                                migrate_services.append((old, new))
                except Exception, er:
                    mainLogger.error("An error occured during InfluxDB data transfer: "+str(er))
                finally:
                    # Empty the migration file
                    open(migration_file, 'w').close()

                #Migrate host probe data
                for h in migrate_hosts:
                    old, new = h
                    migrateLogs(old,new)
                    move_influx_host(old, new)
                #Migrate service data
                for s in migrate_services:
                    old, new = s
                    move_influx_service(old, new)

            #copy the configuration
            with open(output_name, 'a') as output:
                process = subprocess.Popen(copy_command, shell=True, stdout=output, stderr=output)
                process.wait()
            if process.returncode == 0:
                # copy done successfully
                mainLogger.info('Successfully copy new configuration from /tmp/waiting/shinken')
                with open(output_name, 'a') as output:
                    process = subprocess.Popen(restart_command, shell=True, stdout=output, stderr=output)
                    process.wait()
                if process.returncode == 0:
                    # Restart done successfully
                    os.remove(refresh_signal_path)
                    os.remove(hokuto_lock)
                    mainLogger.info('Successfully restarted Shinken')
                else:
                    mainLogger.error('Restart failed, and returned code {0}'.format(process.returncode))
            else:
                mainLogger.error('Copy failed, and returned code {0}'.format(process.returncode))
            mainLogger.info('Update finished')

def move_influx_host(oldname, newname):
    """ Renames a host in the configured InfluxDB database """
    return update_influx_tag('host_name', oldname, newname)

def move_influx_service(oldname, newname):
    """ Renames a service in the configured InfluxDB database """
    return update_influx_tag('service_description', oldname, newname)

def update_influx_tag(tagname, oldval, newval):
    """ Changes the value of a specified tag over all the configured InfluxDB database measurements """
    client = create_influx_client()
    xoldval = _secure_query_string(oldval)
    xnewval = _secure_query_string(newval)
    logger = getLogger()
    logger.info('Changing InfluxDB tag "{}" value from "{}" to "{}"'.format(tagname, oldval, newval))
    # Find all entries with the specified tag
    for serie in _influx_get_series(client, tagname, xoldval):
        # Get all the data from that series
        whereclause = ' AND '.join([ i[0] + "=" + _secure_query_string(i[1]) for i in serie['tags'].iteritems()])
        data = client.query('SELECT * FROM {} WHERE {}'.format(serie['measurement'], whereclause))
        # Transfer old points to new points, changing the tag value on the way
        new_data = []
        for d in data.get_points():
            nd = {
                'measurement': serie['measurement'],
                'tags': {},
                'fields': {}
            }
            is_perfdata = serie['measurement'].startswith('metric_')
            for key, value in d.iteritems():
                if key == u'time':
                    if value is not None:
                        nd[u'time'] = value
                elif key == tagname:
                    # Change this tag's value
                    nd['tags'][key] = newval
                elif key in serie[u'tags']:
                    # Transfer this tag as-is
                    nd['tags'][key] = value
                else:
                    # If it's not a tag then it's a field
                    # Just make sure all perfdata numbers are floats to avoid type conflicts
                    # (because that's how the shinken module stores them)
                    if is_perfdata and isinstance(value, (int, long)):
                        value = float(value)
                    nd['fields'][key] = value
            
            new_data.append(nd)
        # Remove the old points
        client.query('DROP SERIES FROM {} WHERE {}'.format(serie['measurement'], whereclause))
        # Insert the new points
        client.write_points(new_data)
        logger.info('Transferred InfluxDB data for series ' + repr(serie)

def _influx_get_series(client, tagname, tagval):
    result = []
    data = client.query("SHOW SERIES WHERE {}={}".format(tagname, tagval))
    for row in data.get_points():
        parts = row[u'key'].split(',')
        # We do a replace on the tag value because the "show series" command does not unescape
        # spaces, so we have to unescape them manually :/
        if len(parts) > 0:
            yield {
                'measurement': parts[0],
                'tags': { k[0] : k[1].replace('\\ ', ' ') for k in [ l.split('=') for l in parts[1:] ] }
            }

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
        logging.basicConfig(filename=logging_file, level=logging.DEBUG)
    return logging.getLogger(__name__)

def create_influx_client():
    # Read the configuration file
    parser = ConfigParser.ConfigParser()
    parser.readfp(open('/etc/hokuto.cfg'))
    conf = parser.items('config')

    host = None
    port = None
    db = None
    user = None
    password = None
    for pair in conf:
        if pair[0] == 'influx_host':
            host = pair[1]
        elif pair[0] == 'influx_port':
            port = pair[1]
        elif pair[0] == 'influx_database':
            db = pair[1]
        elif pair[0] == 'influx_username':
            user = pair[1]
        elif pair[0] == 'influx_password':
            password = pair[1]
    
    # Check that everything is there
    missing = []
    if host is None:
        missing.append('INFLUX_HOST')
    if port is None:
        missing.append('INFLUX_PORT')
    if db is None:
        missing.append('INFLUX_DATABASE')
    if user is None:
        missing.append('INFLUX_USERNAME')
    if password is None:
        missing.append('INFLUX_PASSWORD')
    if len(missing) > 0:
        raise Exception('Missing InfluxDB configuration directives: ' + ', '.join(missing))

    try:
        port = int(port)
    except ValueError:
        raise Exception('The current configuration value for INFLUX_PORT ("{}") is not a valid number'.format(port))

    getLogger().debug("Connecting influxDB to {}@{}:{}".format(db, host, port))
    return InfluxDBClient(host=host, port=port, database=db, username=user, password=password)

def _secure_query_string(value):
    """
    Secures a string so it can be used in an Influx query as a string constant
    """
    return "'" + value.replace("'", "\\'") + "'"

if __name__ == '__main__':
    main()
