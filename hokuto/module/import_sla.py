#/usr/bin/env python

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Nicolas Lantoing, nicolas@omegacube.fr
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

""" Import data from livestatus archives to the sla database """

from os import listdir
from os.path import isfile, join

import sqlite3
import ConfigParser

parser = ConfigParser.ConfigParser()
parser.readfp(open('/etc/hokuto.cfg'))
conf = parser.items('config')
userconfig = {}
for c in conf:
    userconfig[c[0].upper().rstrip()] = c[1]

ARCHIVES_DIRECTORY='/var/log/shinken/archives'
TARGET_DB=userconfig['DB_PATH']
CURRENT_DB='/var/log/shinken/livelogs.db'
ARCHIVES_DB=sorted([ f for f in listdir(ARCHIVES_DIRECTORY) if isfile(join(ARCHIVES_DIRECTORY,f)) \
              and f.split('.')[-1] == 'db' \
              and f.split('-')[0] == 'livelogs'])

target = sqlite3.connect(TARGET_DB)
counter = 0

def check_if_exist(entity):
    """ Check if the given entity already exist in the target database """
    c = target.cursor()
    c.execute("SELECT time FROM sla WHERE time=%d AND host_name='%s' AND service_description='%s' LIMIT 1;"%(entity[2],entity[0],entity[3]))
    check = c.fetchone()
    c.close()
    if check:
        return True
    return False

def get_last_state_record(entry):
    """ Return the last state recorded for the couple host/service """
    c = target.cursor()
    c.execute("SELECT state FROM sla WHERE time<%d AND host_name='%s' AND service_description='%s' ORDER BY time DESC LIMIT 1;"%(entry[2],entry[0],entry[3]))
    last = c.fetchone()
    if last is not None:
        last = last[0]
    c.close()
    return last

def import_db(db):
    """ Parse and import state change entrys from the given database """
    global counter
    livestatus = sqlite3.connect(db)
    c = livestatus.cursor()
    c.execute("SELECT host_name,state,time,service_description FROM logs WHERE state_type = 'HARD' AND class = 1 ORDER BY time ASC;")
    results = c.fetchall()
    for entry in results:
        if not check_if_exist(entry):
            last = get_last_state_record(entry)
            if last != entry[1]:
                print "Insert new entry : %s.%s - %d"%(entry[0], entry[3], entry[1])
                c = target.cursor()
                c.execute("INSERT INTO sla (host_name, service_description, state, time) VALUES ('%s', '%s', %d, %d);"%(entry[0],entry[3],entry[1],entry[2]))
                counter = counter + 1
                last = entry
                target.commit()
                c.close()
    livestatus.close()

print "Importing archived logs"
for d in ARCHIVES_DB:
    print "Working with %s"%d
    import_db(join(ARCHIVES_DIRECTORY,d))

print "Importing active logs db"
import_db(CURRENT_DB)

print "Done. %d new entry imported from archives"%counter
target.close()
