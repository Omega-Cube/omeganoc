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

import os.path
from datetime import datetime
from random import random, choice
from time import time

from flask import render_template, redirect, url_for, request, abort
from flask.ext.login import login_user, current_user
from sqlalchemy.sql import bindparam

from . import app, db

try:
    import requests
except ImportError:
    requests = None

CAPTCHA_CORRECT = 'correct'
CAPTCHA_INCORRECT = 'incorrect'
CAPTCHA_ERROR = 'error'

# Accounts will be deleted if they were created more than this amount of seconds ago
_max_lifetime = 7200 #60*60*2

# Accounts will be deleted if they were not active since this amount of seconds
_activity_timeout = 1800 #60*30

# The ID of the user the dashboard and graph settings will be copied from
_reference_user_id = 1

# A super secret server token for the captcha generator!
_captcha_server_token = None

# The name of one user that will be able to make changes, even with demo mode active
_demo_admin_user = 'admin'

@app.route('/demo-landing')
def demo_landing():
    """ This page tells the user that he tried to use a feature that is not available in demo mode """
    return render_template('demo-landing.html')
    
@app.route('/demo-create', methods=['POST', 'GET'])
def demo_create():
    """ This page creates a new user account and gives the new login data to the user """
    if not is_in_demo():
        app.logger.debug('Someone tried to access the demo user creation page, but the demo mode is disabled!')
        return abort(404)
    # Check that the requests lib is available
    if requests is None:
        app.logger.error('Someone tried to access the demo user creation page, but the requests lib is not available!')
        return abort(500)
    # Don't create an account if the user already have one
    if current_user is not None and not current_user.is_anonymous():
        return redirect(url_for('index'))
    verified = False
    captcha_error = False
    login = ''
    passwd = ''
    app.logger.debug('form values: ')
    # Do we have a captcha result ?
    if 'g-recaptcha-response' in request.form:
        usertoken = request.form['g-recaptcha-response']
        result = _check_captcha_response(usertoken)
        if result == CAPTCHA_CORRECT:
            login, passwd, user = create_demo_user()
            login_user(user)
            verified = True
        elif result == CAPTCHA_INCORRECT:
            captcha_error = True
        else:
            return abort(500)
    return render_template('demo-create.html', username=login, password=passwd, verified=verified, captcha_error=captcha_error)
    
def is_in_demo(check_admin=True):
    """ Returns True if the demo mode is enabled, False otherwise """
    global _demo_admin_user
    # No demo restrictions for the admin
    if(check_admin and not current_user.is_anonymous() and current_user.username == _demo_admin_user):
        return False
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
        elif u.last_activity_date is None or u.last_activity_date < last_activity_limit:
            app.logger.debug('User {0} "{1}" marked for flushing (activity timeout)'.format(u.id, u.username))
            remove = True
        if remove:
            remove_user(u.id)

_characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
def create_demo_user():
    from user import User, remove_user
    global _characters
    #generate a random name and password
    suffix_size = int(random() * 4 + 4)
    name = 'user_' + ''.join([choice(_characters) for i in range(suffix_size)])
    password = ''.join([choice(_characters) for i in range(8)])
    # Make sure this username actually does not exist
    while User.query.filter_by(username = name).first():
        name = 'user_' + ''.join([choice(_characters) for i in range(suffix_size)])
        
    # Create a new user
    user = User(name, password, True)
    user.shinken_contact = app.config.get('DEMO_USER', 'admin')
    db.session.add(user)
    db.session.commit()
    create_default_graph(user.id)
    create_default_dashboard(user.id)
    return name, password, user

def create_default_graph(userid):
    from grapher import graphTokenTable
    global _reference_user_id
    source = graphTokenTable.select()\
                            .where(graphTokenTable.c.user_id == _reference_user_id)
    inserts = [{'user_id': userid,
                'graph_id': row['graph_id'],
                'key': row['key'],
                'value': row['value']} for row in db.engine.execute(source)]
    if len(inserts) > 0:
        db.engine.execute(graphTokenTable.insert(), inserts)
    
def create_default_dashboard(userid):
    from dashboard import partsTable, partsConfTable
    global _reference_user_id
    configQuery = partsConfTable.select().where(partsConfTable.c.parts_id == bindparam('part_id'))
    pSource = partsTable.select().where(partsTable.c.user_id == _reference_user_id)
    pInserts = [dict(row.items()) for row in db.engine.execute(pSource)]
    pcInserts = []
    for i in pInserts:
        if 'id' in i:
            i['user_id'] = userid
            oldid = i['id']
            del i['id']
            newid = db.engine.execute(partsTable.insert(), [i]).lastrowid
            confdata = [dict(row.items()) for row in db.engine.execute(configQuery, part_id=oldid)]
            for data in confdata:
                data['parts_id'] = newid
            pcInserts = pcInserts + confdata
    db.engine.execute(partsConfTable.insert(), pcInserts)
    #parts (user_id)
    #parts_conf (parts_id)
    pass
    
def _get_captcha_server_token():
    global _captcha_server_token
    if _captcha_server_token is None:
        # Load the token from a token file
        tokenpath = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'captcha.key')
        if os.path.isfile(tokenpath):
            with open(tokenpath, 'r') as f:
                _captcha_server_token = f.read()
                return _captcha_server_token
        _captcha_server_token = ''
    return _captcha_server_token
    
def _check_captcha_response(usertoken):
    servertoken = _get_captcha_server_token()
    if not servertoken:
        app.logger.error('There is no server key available for the captcha system!')
        return CAPTCHA_ERROR
    # Check the captcha
    response = requests.post('https://www.google.com/recaptcha/api/siteverify', data={'secret': servertoken, 'response': usertoken})
    if response.status_code != 200:
        app.logger.warning('The captcha verification service returned an error! (status {0}: {1}'.format(response.status_code, r.reason))
        return CAPTCHA_ERROR
    rdata = response.json()
    if rdata['success']:
        return CAPTCHA_CORRECT
    errors = app.logger.warning('The captcha verification failed, with error codes ' + ', '.join(rdata['error-codes']))
    if 'invalid-input-response' in rdata['error-codes'] or 'missing-input-response' in rdata['error-codes']:
        return CAPTCHA_INCORRECT
    else:
        app.logger.warning('The captcha service rejected our secret key (see previous log line)')
        return CAPTCHA_ERROR