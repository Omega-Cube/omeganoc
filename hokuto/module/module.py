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

import threading
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

        logger.debug('[hokuto] Initializing')

        self.regen = Regenerator() # TODO: Keep this ? seems useless

    # Broker init
    def init(self):
        logger.debug('[hokuto] Initializing module {0}'.format(self.name))

    def main(self):
        self.set_proctitle(self.name)
        self.log = logger
        self.log.load_obj(self)

        try:
            self.do_main()
        except Exception, ex:
            logger.warning('[hokuto] error! ' + ex.message)
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
        self.data_thread = threading.Thread(None, self.manage_brok_thread, 'datathread')
        self.data_thread.start()

    # SLA
    def manage_log_brok(self,b):
        """ Intercept log type brok and append state change to the SLA database if needed """
        from web import db
        from web.sla import Sla

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
                logger.debug("[hokuto] %s %s %s.%s"%(values['time'],values['state'],values['host_name'],values["service_description"]))
                lastState = Sla.query\
                               .filter_by(host_name = values['host_name'], service_description = values["service_description"])\
                               .order_by(Sla.time.desc())\
                               .first()

                if lastState is not None and lastState.state == values['state']:
                    return
                entry = Sla(values['host_name'],values["service_description"],values['time'],values['state'])
                db.session.add(entry)
                db.session.commit()

        except Exception, exp:
            logger.error("[hokuto] %s"%str(exp))

    def manage_brok_thread(self):
        """ Receive brok message and empty the queue to prevent memory leaks. """
        while True:
            l = self.to_q.get()
            for b in l:
                self.manage_brok(b)
            self.to_q.task_done()
