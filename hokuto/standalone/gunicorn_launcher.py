#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2015 Omega Cube and contributors
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

""" Hokuto launcher using the Gunicorn server """

import os.path
import sys
import traceback

import gunicorn.app.base

from web import init

class GunicornApp(gunicorn.app.base.Application):
    def __init__(self, app):
        self.application = app
        super(GunicornApp, self).__init__()
        
    def load_config(self):
        config = self.application.config
        # Constant configuration
        self.cfg.set('proc_name', 'hokuto')
        # Renamed values / forwarded values
        if 'PIDFILE' in config:
            self.application.logger.debug('Setting gunicorn pidfile value to "{0}"'.format(config['PIDFILE']))
            self.cfg.set('pidfile', config['PIDFILE'])
        # Transfer of values starting with GUNICORN_
        for key, value in self.application.config.iteritems():
            if key.startswith('GUNICORN_'):
                gkey = key[9:].lower()
                self.application.logger.debug('Setting Gunicorn setting "{0}" to "{1}"'.format(gkey, value))
                self.cfg.set(gkey, value)
                
    def load(self):
        return self.application

def check_is_running(hokuto):
    pidpath = hokuto.conf['PIDFILE']
    return os.file.isfile(pidpath)
    
def run_app(hokuto):
    gapp = GunicornApp(hokuto)
    hokuto.logger.info('Starting hokuto')
    gapp.run()
    
def main():
    try:
        hokuto = None
        hokuto = init(None)
        if hokuto is None:
            print 'Hokuto could not be initialized'
            sys.exit(2)
        run_app(hokuto)
    except:
        try:
            (extype, exvalue, tb) = sys.exc_info()
            if hokuto is None:
                print 'Could not initialize Hokuto!'
                print 'Error type: ' + str(extype)
                print 'Error message: ' + exvalue.message
                traceback.print_tb(tb)
            else:
                hokuto.logger.critical('An error occured during initialization', exc_info = True)
        except:
            (extype, exvalue, tb) = sys.exc_info()
            print 'Error during initialization: ' + str(exvalue)
            traceback.print_tb(tb)
        sys.exit(1)
    
if __name__ == '__main__':
    main()
