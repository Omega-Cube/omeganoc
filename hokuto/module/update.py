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

""" Update hokuto, run any aditional operations if needed """

import sqlite3
import os
import ConfigParser

NEW_VERSION_FILE = os.path.dirname(__file__) + '/../standalone/VERSION'
CUR_VERSION_FILE = '/usr/local/hokuto/VERSION'

#load config
config = ConfigParser.ConfigParser()
config.readfp(open('/etc/hokuto.cfg'))
conf = dict(config.items('config'))

with open(NEW_VERSION_FILE,'r') as o:
    NEW_VERSION = float(o.read())

#touch the file if not exist
open(CUR_VERSION_FILE,'a').close()
with open(CUR_VERSION_FILE, 'r') as o:
    CUR_VERSION = o.read() or '0.0'
    CUR_VERSION = float(CUR_VERSION)

print "Current version is "+CUR_VERSION
print "Looking for update operations..."
#check if current version != installed
if(float(CUR_VERSION) < 0.95):
    """ Migration to the new separator model for charts """
    print "Updating database for the new separator model"
    db = sqlite3.connect(conf['db_path'])
    c = db.cursor()
    oldsep = "-"
    c.execute("SELECT key FROM parts_conf WHERE key LIKE 'probe|%' GROUP BY key;")
    results = c.fetchall()
    for result in results:
        probe = result[0]
        tmp = probe.split(oldsep)
        newprobe = conf['graphite_sep'].join(tmp)
        c.execute("UPDATE parts_conf SET key='{0}' WHERE key='{1}';".format(newprobe,probe))
    db.commit()
    c.close()

#update cur_version -> installed version
print "Update done, installed version is now " + str(NEW_VERSION)
