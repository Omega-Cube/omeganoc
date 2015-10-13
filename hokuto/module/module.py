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

import os
import Queue
import sqlite3
import time
import traceback

from shinken.basemodule import BaseModule
from shinken.daemon import Daemon
from shinken.log import logger
from shinken.message import Message
from shinken.misc.regenerator import Regenerator

# used by SLA manager
import re
from shinken.modulesctx import modulesctx
livestatus_broker = modulesctx.get_module('livestatus')
LOGCLASS_INVALID = livestatus_broker.LOGCLASS_INVALID
Logline = livestatus_broker.Logline

properties = {
    'daemons': ['broker', 'scheduler'],
    'type': 'hokuto',
    'phases': ['running'],
    'external': True,
}

def get_instance(plugin):
    return HokutoLogCacher(plugin)

class HokutoLogCacher(BaseModule, Daemon):
    def __init__(self, modconf):
        BaseModule.__init__(self, modconf)
        logger.debug('[hokuto-log-cacher] Initializing')
        self.regen = Regenerator() # TODO: Keep this ? seems useless
        self.db_path = getattr(modconf, 'db_path', None)
        if self.db_path is None:
            logger.error('[hokuto-log-cacher] No database path configured. Please specify one with db_path in the module configuration file.')
            raise

    # Broker init
    def init(self):
        logger.debug('[hokuto-log-cacher] Initializing module {0}'.format(self.name))

    def main(self):
        self.set_proctitle(self.name)
        self.log = logger
        self.log.load_obj(self)

        try:
            self.do_main()
        except Exception, ex:
            logger.warning('[hokuto-log-cacher] An error occured in  ' + ex.message)
            logger.debug(traceback.format_exc())
            msg = Message(id=0, type='ICrash', data={
                    'name': self.get_name(),
                    'exception': exp,
                    'trace': traceback.format_exc()
            })
            self.from_q.put(msg)
            # wait 2 sec so we know that the broker got our message, and die
            time.sleep(2)
            # (try to) clean before exit
            self.do_stop()
            raise

    def do_main(self):
        self.set_exit_handler()
        self.manage_brok_thread()

    # SLA
    def manage_log_brok(self,b):
        """ Intercept log type brok and append state change to the SLA database if needed """

        data = b.data
        line = data['log']

        if re.match("^\[[0-9]*\] [A-Z][a-z]*.:", line):
            # Match log which NOT have to be stored
            return

        try:
            logline = Logline(line=line)
            values = logline.as_dict()
            if values['state_type'] != 'HARD' or values['logclass'] != 1:
                return

            if logline.logclass != LOGCLASS_INVALID:
                logger.debug('[hokuto-log-cacher] %s %s %s.%s'%(values['time'],values['state'],values['host_name'],values['service_description']))
                with sqlite3.connect(self.db_path) as conn:
                    if not self.check_db_has_sla(conn): # Abort if the table doesn't exist. 
                                                   # This may happen if hokuto was just installed and the broker receives data
                                                   # before Hokuto initializes the database
                        logger.warning("[hokuto-log-cacher] A log brok was skipped: hokuto's database wasn't ready to receive it. Launching Hokuto once should solve this problem.")
                        return
                    row = conn.execute("SELECT state FROM sla WHERE host_name=? AND service_description=? ORDER BY time DESC LIMIT 1", (values['host_name'], values['service_description'])).fetchone()
                    #lastState = Sla.query\
                    #               .filter_by(host_name = values['host_name'], service_description = values['service_description'])\
                    #               .order_by(Sla.time.desc())\
                    #               .first()
    
                    if row is None or row[0] != values['state']:
                        conn.execute('INSERT INTO sla (host_name, service_description, state, time) VALUES (?, ?, ?, ?)', (values['host_name'], values['service_description'], values['state'], values['service_description']))

        except Exception, exp:
            logger.error("[hokuto-log-cacher] %s"%str(exp))

    def check_db_has_sla(self, conn):
        """ Checks whether the specified sqlite connection has an SLA table """
        return conn.execute("SELECT name FROM sqlite_master WHERE name='sla' AND type='table'").fetchone() is not None

    def manage_brok_thread(self):
        """ Receive and process brok messages """
        while not self.interrupted:
            try:
                l = self.to_q.get()
            except IOError as ex:
                if ex.errno != os.errno.EINTR:
                    raise
            except Queue.Empty:
                pass
            else:
                for b in l:
                    # b.prepare()
                    self.manage_brok(b)
                self.to_q.task_done()