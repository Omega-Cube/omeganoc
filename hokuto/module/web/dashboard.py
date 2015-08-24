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

""" Contains tools used to display the dashboards """

from flask import render_template, request, abort
from flask.ext.login import login_required, current_user
from sqlalchemy import Table, select, exists, or_

from . import app, db
from ajax import jsondump
from widgetsloader import load_widgets_list
from unit import Unit

import json
from collections import defaultdict

@app.route('/dashboards')
@login_required
def dashboards(dashname = None):
    """ Dashboards landing page """
    return render_template("dashboards.html")

@app.route('/dashboards/list')
@login_required
def dashboards_list():
    """ Returns a list of user's dashboards """
    return jsondump(get_list_dashboards(), True)

@app.route('/dashboards/checkname')
def dashboards_checkname():
    """ Returns a JSON boolean indicating if the specified name exists """
    name = request.args['name']
    if not name:
        return abort(404)
    return jsondump(not dashboard_name_exists(name));

@app.route('/dashboards/details/<dashboardName>')
@login_required
def dashboards_details(dashboardName):
    """ Gets the details (that is, a list of all installed parts) for a specific dashboard """
    data = get_dashboard_parts(dashboardName)
    if data is None or len(data) == 0:
        abort(404)
    return jsondump(data)

@app.route('/dashboards', methods=['POST'])
@login_required
def dashboards_save():
    """ This method saves modifications applied on dashboards """
    # The only thing you can actually do here is renaming a dashboard...
    oldname = request.form['oldname']
    newname = request.form['newname']
    rename_dashboard(oldname, newname)
    return "",200

@app.route('/dashboards/part', methods=['POST'])
@login_required
def dashboard_part_save():
    """ Save a new part """
    pid = int(request.form['id'])
    oldid = pid
    savedata = {'id': pid}
    if 'width' in request.form:
        savedata['width'] = int(float(request.form['width']))
    if 'height' in request.form:
        savedata['height'] = int(float(request.form['height']))
    if 'col' in request.form:
        savedata['col'] = int(request.form['col'])
    if 'row' in request.form:
        savedata['row'] = int(request.form['row'])
    if pid <= 0:
        # New part
        savedata['widget'] = request.form['widget']
        savedata['dashboard'] = request.form['dashboard']
        savedata['title'] = request.form['title']
        pid = create_part(**savedata)
    else:
        # Existing part
        if 'title' in request.form:
            savedata['title'] = request.form['title']
        del savedata['id']
        if len(savedata):
            update_part(pid, **savedata)

    if 'conf' in request.form:
        update_part_conf(pid, json.loads(request.form['conf']))

    return jsondump({'original_id': oldid, 'saved_id': pid})

#TODO: Create delete probe and delete scale methods
@app.route('/dashboards/part/keys/delete/<int:pid>', methods=['DELETE'])
@login_required
def dashboard_part_keys_delete(pid):
    """ Remove partsConf entrys """
    probekeys= []
    probe= False
    scale= False
    if 'probe' in request.form:
        probe= request.form['probe']

    if 'scale' in request.form:
        scale= request.form['scale']

    if probe or scale:
        for row in db.engine.execute(select([partsConfTable.c.key]).where(partsConfTable.c.parts_id == pid)):
            if (probe and row[0].startswith('probe|'+probe+'|')) or (scale and row[0].startswith('scale|'+scale+'|')):
                probekeys.append(partsConfTable.c.key == row[0])

    remove_conf_key(pid,probekeys)
    return "",200

@app.route('/dashboards/part/<int:pid>', methods=['DELETE'])
@login_required
def dashboard_delete_part(pid):
    delete_part(pid)
    return "",200


@app.route('/dashboards/<dashboard>', methods=['DELETE'])
@login_required
def dashboard_delete(dashboard):
    query = select([partsTable.c.id]).where(partsTable.c.user_id == current_user.id).where(partsTable.c.dashboard == dashboard).distinct()
    for row in db.engine.execute(query).fetchall():
        delete_part(row[0])
    return "",200


# CONTEXT PROCESSOR
@app.context_processor
def global_dashboards_list():
    """ This context processor injects the list of the user's dashboards so they
        can be displayed on the main menu on every page
    """
    if(current_user.is_authenticated()):
        list = get_list_dashboards();
        return dict(dashboards_list=list)
    else:
        return dict()

# DATA ACCESS
def get_list_dashboards():
    """ Returns a list of dashboard names available to the currently connected user """
    query = select([partsTable.c.dashboard]).where(partsTable.c.user_id == current_user.id).distinct()
    return [row[0] for row in db.engine.execute(query).fetchall()]

def dashboard_name_exists(name):
    """ Checks if the currently connected user has a dashboard with the provided name """
    query = select([exists().where(partsTable.c.user_id == current_user.id).where(partsTable.c.dashboard == name)])
    result = db.engine.execute(query).scalar()
    return result > 0


def get_dashboard_parts(dashboard):
    """ Returns an array of all the parts contained in the specified dashboard """
    query = select([partsTable]).where(partsTable.c.user_id == current_user.id).where(partsTable.c.dashboard == dashboard)
    resultset = db.engine.execute(query)
    return [{'id': row[partsTable.c.id],
             'widget': row[partsTable.c.widget],
             'dashboard': dashboard,
             'title': row[partsTable.c.title],
             'width': row[partsTable.c.width],
             'height': row[partsTable.c.height],
             'col': row[partsTable.c.col],
             'row': row[partsTable.c.row],
             'conf': get_conf(row[partsTable.c.id]),
         } for row in resultset]

def create_part(**partdata):
    """ Creates a new part for the current user, returning its ID.
        The informations that must be provided for creation are the widget, dashboard
        and title of the new part.
    """
    # TODO: check that the dashboards count does not exceed some maximum

    # Check for required data
    if 'widget' not in partdata:
        raise Exception('Missing part data: widget')
    wnames = [w.name for w in load_widgets_list()]
    if partdata['widget'] not in wnames:
        raise Exception('The new part widget does not exist')
    if 'dashboard' not in partdata or not partdata['dashboard']:
        raise Exception('Missing part data: dashboard')
    if 'title' not in partdata or not partdata['title']:
        raise Exception('Missing part data: title')

    partdata['user_id'] = current_user.id
    if 'id' in partdata:
        del partdata['id'] # Remove the ID so we get the database-generated ID
    return db.engine.execute(partsTable.insert(), partdata).inserted_primary_key[0]


def update_part(id, **partdata):
    """ Updates the specified part, if it belongs to the currently connected user.
        Note that the user_id, widget, and dashboard fields will not be saved.
        Also, empty titles are not taken into account.
    """
    # Remove any data that cannot change after creation
    if 'id' in partdata:
        del partdata['id']
    if 'user_id' in partdata:
        del partdata['user_id']
    if 'widget' in partdata:
        del partdata['widget']
    if 'dashboard' in partdata:
        del partdata['dashboard']
    # Don't save empty titles
    if 'title' in partdata and not partdata['title']:
        del partdata['title']

    query = partsTable.update().where(partsTable.c.id == id).where(partsTable.c.user_id == current_user.id)
    db.engine.execute(query, partdata);

# PARTS CONF
@app.route('/dashboards/part/conf/<id>')
def get_conf(id):
    query = select([partsConfTable]).where(partsConfTable.c.parts_id == id)
    results = {}
    results['probes'] = defaultdict(dict)
    results['scales'] = defaultdict(dict)

    for row in db.engine.execute(query):
        if(row[1].startswith('probe|')):
            probe = row[1].split('|',3)
            results['probes'][probe[1]][probe[2]] = row[2]
        elif row[1].startswith('scale|'):
            scale = row[1].split('|',3)
            results['scales'][scale[1]][scale[2]] = row[2]
        else:
            results[row[1]] = row[2]
    return results

def update_part_conf(id,conf):
    """ Update part's conf table
        TODO: need more check and error handling
    """
    for(key,value) in conf.items():
        if key == 'probes':
            for(probe,setting) in value.items():
                for(name, v) in setting.items():
                    probeKey='probe|'+probe+'|'+name
                    entry={
                        'parts_id':id,
                        'key': probeKey,
                        'value':v
                    }
                    save_conf_key(id, probeKey, entry)
        elif key == 'scales':
            for(scale,setting) in value.items():
                for(name, v) in setting.items():
                    scaleKey='scale|'+scale+'|'+name
                    entry={
                        'parts_id':id,
                        'key': scaleKey,
                        'value':v
                    }
                    save_conf_key(id, scaleKey, entry)

        else:
            entry = {
                'parts_id': id,
                'key': key,
                'value': value
            }
            save_conf_key(id,key,entry)

def remove_conf_key(parts_id,keys):
    """ Remove conf key """
    query = partsConfTable.delete().where(partsConfTable.c.parts_id == parts_id).where(or_(*keys))
    db.engine.execute(query)

def save_conf_key(parts_id,key,entry):
    """ Add or update a key into the parts_conf table """
    oldconf = [row[0] for row in db.engine.execute(select([partsConfTable.c.key]).where(partsConfTable.c.parts_id == parts_id))]
    if(key in oldconf):
        result = db.engine.execute(partsConfTable.update().where(partsConfTable.c.parts_id == parts_id).where(partsConfTable.c.key == key), entry)
    else:
        result = db.engine.execute(partsConfTable.insert(), entry)

def delete_part(id):
    """ Removes the specified part from the database, if it belongs to the current user """
    query = partsTable.delete().where(partsTable.c.id == id).where(partsTable.c.user_id == current_user.id)
    db.engine.execute(query)
    query = partsConfTable.delete().where(partsConfTable.c.parts_id == id)
    db.engine.execute(query)

def rename_dashboard(oldname, newname):
    """ Rename dashboard from the database """
    query = partsTable.update().where(partsTable.c.user_id == current_user.id).where(partsTable.c.dashboard == oldname)
    db.engine.execute(query, {'dashboard': newname})

# DATABASES
partsConfTable = Table('parts_conf',
                     db.metadata,
                     db.Column('parts_id', db.Integer,db.ForeignKey("parts.id"),primary_key=True),
                     db.Column('key',db.String(64),nullable=False,primary_key=True),
                     db.Column('value',db.String(64),nullable=True))

partsTable = Table('parts',
                   db.metadata,
                   db.Column('id', db.Integer, primary_key=True),
                   db.Column('user_id', db.Integer, nullable=False),
                   db.Column('widget', db.String(255), nullable=False),
                   db.Column('dashboard', db.Unicode(255), nullable=False),
                   db.Column('title', db.Unicode(255), nullable=False),
                   db.Column('width', db.Integer, nullable=False, default=1),
                   db.Column('height', db.Integer, nullable=False, default=1),
                   db.Column('col', db.Integer, nullable=False, default=1),
                   db.Column('row', db.Integer, nullable=False, default=1))
