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

import gunicorn.app.base

from web import init

class GunicornApp(gunicorn.app.base.BaseApplication):
    def __init__(self, app):
        self.application = app
        super(GunicornApp, self).__init__()
        
    def load_config(self):
        for key, value in self.application.config.iteritems():
            if key.startswith('GUNICORN_'):
                gkey = key[9:].lower()
                self.application.logger.debug('Setting Gunicorn setting "{0}" to "{1}"'.format(gkey, value))
                self.cfg.set(gkey, value)
                
    def load(self):
        return self.application

if __name__ == '__main__':
    hokuto = init(None)
    gapp = GunicornApp(hokuto)
    gapp.run()