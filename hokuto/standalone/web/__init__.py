#!/usr/bin/env python
#
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

""" Omega Noc web interface package
This package can be used as a Werkzeug website to display and manage
the Omega Noc monitoring system.
"""

import os
import sys
import logging
import ConfigParser

from flask import Flask, render_template, request
from flask.ext.login import LoginManager, login_required
from flask.ext.sqlalchemy import SQLAlchemy
from flask.ext.babel import Babel, gettext
from flask.ext.assets import Environment
from werkzeug.routing import BaseConverter
from werkzeug.contrib.cache import SimpleCache
from shinken.log import logger
from on_reader.livestatus import livestatus

# Global objects
app = None
b = None
babel = None
login_manager = None
cache = None

# TODO : Passing the User class as arguments sucks -_-
def init_db(User):
    from unit import Unit
    from sla import Sla

    db.create_all()

    needcommit = False
    #init users
    if User.query.count() == 0:
        u = User('admin', 'admin', True)
        # TODO : Think to change shinken_contact defaut
        u.shinken_contact = 'admin'
        db.session.add(u)
        needcommit = True

    if Unit.query.count() == 0:
        #init units
        un = Unit('None','',1000,['','k','M','G','T'])
        db.session.add(un)
        un = Unit('Bytes','B',1024,['','k','M','G','T'])
        db.session.add(un)
        un = Unit('bits','b',1000,['','k','M','G','T'])
        db.session.add(un)
        un = Unit('Percentage','%',0,False)
        db.session.add(un)
        needcommit = True

    #commit db
    if needcommit:
        db.session.commit()

def parse_logger_level(value):
    try:
        try:
            result = int(value)
        except ValueError:
            result = getattr(logging, value.upper(), None)
    except:
        print 'log level cant be parsed ' + value
        return None
    return result

def init(config):
    global app
    global babel
    global login_manager
    global db
    global cache

    # Main application object
    app = Flask(__name__)
    if config is None:
        parser = ConfigParser.ConfigParser()
        parser.readfp(open('/etc/hokuto.cfg'))
        conf = parser.items('config')
        userconfig = {}
        for c in conf:
            val = c[1]
            if(c[1] == 'True' or c[1] == 'False'):
                val = bool(val)
            userconfig[c[0].upper().rstrip()] = val
        app.config.update(userconfig)
    else:
        for key in config:
            app.config[key] = config[key]

    # Load any environment-specific configuration file
    if os.environ.get('ONOC_CONFIG') is not None:
        app.config.from_envvar('ONOC_CONFIG')

    # Logging
    logfile = app.config.get('LOGGER_FILE', None)
    if logfile is not None:
        handler = logging.FileHandler(logfile)
        handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
        loglevel = parse_logger_level(app.config.get('LOGGER_LEVEL'))
        if loglevel is not None:
            app.logger.setLevel(loglevel)
            handler.level = loglevel
        app.logger.addHandler(handler)
    app.logger.info('Hokuto is initializing...')

    # Caching
    # A little bit simplistic for now, we could improve that
    cache = SimpleCache()

    # SQLAlchemy
    db = SQLAlchemy(app)

    # Babel
    babel = Babel(app)

    @babel.localeselector
    def babel_locateselector():
        # Fall back to configuration
        return None

    @babel.timezoneselector
    def babel_timezoneselector():
        #Fall back to configuration
        return None

    # Livestatus connector
    if app.config.get('LIVESTATUS_SOCKET', None) is not None:
        livestatus.set_server_address(app.config['LIVESTATUS_SOCKET'])
    else:
        livestatus.set_server_address((app.config.get('LIVESTATUS_HOST', '127.0.0.1'),
                                               int(app.config.get('LIVESTATUS_PORT', 50000))))

    # Security session manager
    login_manager = LoginManager()
    login_manager.init_app(app, add_context_processor=True)
    login_manager.login_message = gettext('Please log in to access this page')
    login_manager.login_view = 'login'

    # A useful route converter that filters a URL using a regular expression
    # It can be used like this in a rule : blah/<regex([a-z]):data>
    class RegexConverter(BaseConverter):
        def __init__(self, map, *items):
            super(RegexConverter, self).__init__(map)
            self.regex = items[0]

    app.url_map.converters['regex'] = RegexConverter

    # Assets manager
    #assets = Environment(app)
    #register_all(app, assets)

    # Include views
    import user # User management (incl. login)
    import grapher # Graph screens (logical & physical)
    import dashboard # Dashboard page
    import widgetsloader # Dashboard widgets tools
    import structureservice
    import graphiteservice # Graphites services
    import livestatusservice # Livestatus services
    import predictservice # predictation tools
    import reports # logs screens
    import configservice # Shinken configuration web services
    
    #Starting point
    @app.route('/')
    @login_required
    def index():
        return render_template('main.html')

    init_db(user.User)
    app.logger.debug('Initialization successful!')
    return app
