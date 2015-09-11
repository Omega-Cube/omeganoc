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

""" Utilities related to the demo mode """

from datetime import datetime
from time import time

from flask import render_template, redirect, url_for

from . import app

# Accounts will be deleted if they were created more than this amount of seconds ago
_max_lifetime = 7200 #60*60*2

# Accounts will be deleted if they were not active since this amount of seconds
_activity_timeout = 1800 #60*30

@app.route('/demo-landing')
def demo_landing():
    """ This page tells the user that he tried to use a feature that is not available in demo mode """
    return render_template('demo-landing.html')

def is_in_demo():
    """ Returns True if the demo mode is enabled, False otherwise """
    return app.config.get('DEMO', False) == True

def create_demo_response():
    """ Creates a standard response sent to the client when an AJAX request cannot be fullfilled because it is not available in demo mode """
    return 'Not implemented in the demo version', 501

def create_demo_redirect():
    """ Creates a standard response sent to the client when a page is not available because we're in demo mode """
    return redirect(url_for('demo_landing'))

def flush_old_demo_data():
    print 'Flushing demo data'
    # We do the import here to avoid a circular reference at startup (because user import demo)
    from user import User, remove_user
    t = time()
    create_limit = datetime.fromtimestamp(t - _max_lifetime)
    last_activity_limit = datetime.fromtimestamp(t - _activity_timeout)
    users = User.query.all()
    for u in users:
        # Do not remove the admin user
        if u.id == 1:
            continue
        remove = False
        # Check the creation date
        if u.create_date < create_limit:
            app.logger.debug('User {0} "{1}" marked for flushing (too old)'.format(u.id, u.username))
            remove = True
        # Check last activity date
        elif u.last_activity_date < last_activity_limit:
            app.logger.debug('User {0} "{1}" marked for flushing (activity timeout)'.format(u.id, u.username))
            remove = True
        if remove:
            remove_user(u.id)