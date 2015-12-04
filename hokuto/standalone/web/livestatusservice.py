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

""" Livestatus webservices """

import json
import on_reader.livestatus as livestatus
import time

from flask import render_template,request,jsonify,abort
from flask.ext.login import login_required, current_user

from . import app, utils

def _get_hosts(group = None):
    """ Get available hosts for current user"""

    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)

    query = livestatus.livestatus.hosts._query
    if group:
        query.filter('groups >= %s'%group)
    data = query.call()

    data = [d['name'] for d in data if d['name'] in permissions['hosts']]

    return data

# WEBSERVICES
@app.route('/services/livestatus/get/structure/',defaults={'table': False})
@app.route('/services/livestatus/get/structure/<string:table>')
@login_required
def get_structure(table):
    """ Get the whole livestatus tables and columns details """

    query = livestatus.livestatus.columns._query
    data = query.call()

    results = {}
    for row in data:
        if(table and table != row['table']):
            continue
        if(not results.has_key(row['table'])):
            results[row['table']] = []
        results[row['table']].append([row['name'],row['description']])

    return jsonify(results)

@app.route('/services/livestatus/get/hosts')
@login_required
def get_hosts():
    """ Get hosts """
    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)

    query = livestatus.livestatus.hosts._query
    for key, value in request.args.iteritems():
        query = query.filter('{0} = {1}'.format(key, value))
    data = query.call()

    data = [d for d in data if d['name'] in permissions['hosts']]
    for d in data:
        d['services'] = [s for s in d['services'] if s in permissions['services']]

    return jsonify({'results': data})

@app.route('/services/livestatus/get/hostgroups')
@login_required
def get_hostgroups():
    """ Return hostgroups """

    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)

    return jsonify({'results': permissions['hostgroups']})

@app.route('/services/livestatus/get/services')
@login_required
def get_services():
    """ Get services """

    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)

    query = livestatus.livestatus.services._query
    for key, value in request.args.iteritems():
        query = query.filter('{0} = {1}'.format(key, value))
    data = query.call()

    data = [d for d in data if d['description'] in permissions['services']]

    return jsonify({'results': data})

@app.route('/services/livestatus/get/service/logs/<string:host>/<string:service>/')
@login_required
def get_service_formated_logs(host,service):
    """ Return logs infos from host's service """

    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)
    if host not in permissions['hosts']:
        return "User %s is not allowed to get informations from %s"%(shinken_contact,host),403

    query = livestatus.livestatus.log._query
    start = request.args.get('start') if request.args.get('start') != 'false' else time.time() - 30 * 24 * 3600
    end = request.args.get('end') if request.args.get('end') != 'false' else time.time()
    start = int(float(start))
    end = int(float(end))
    columns = ['time','options','plugin_output','host_name','type','state','service_description']

    query = query.columns(*columns)
    query = query.filter("host_name = %s"%host)
    query = query.filter("service_description = %s"%service)
    query = query.filter("service_description = ")
    query = query.filter("Or: 2")
    query = query.filter("state = 1")
    query = query.filter("state = 2")
    query = query.filter("Or: 2")
    query = query.filter("time >= %d"%start)
    query = query.filter("time <= %d"%end)
    query = query.filter("And: 2")
    
    data = query.call()
    return jsonify({'results': data})

@app.route('/services/livestatus/get/host/logs/<string:host>/',defaults={'columns': False})
@app.route('/services/livestatus/get/host/logs/<string:host>/<string:columns>')
@login_required
def get_host_formated_logs(host,columns):
    """ Return logs infos from host """

    shinken_contact = current_user.shinken_contact
    permissions = utils.get_contact_permissions(shinken_contact)
    if host not in permissions['hosts']:
        return "Current user is not allowed to get logs from %s"%host,403

    query = livestatus.livestatus.log._query
    start = time.time() - 30 * 3600 * 24
    if(columns):
        columns = columns.split(',')
        query = query.columns(*columns)
    query = query.filter("host_name = %s"%host)
    query = query.filter("time >= %d"%start)

    data = query.call()
    return jsonify({'results': data})

@app.route('/services/livestatus/states')
@login_required
def get_current_states():
    """ Return the current states for each hosts and services """

    hosts = livestatus.livestatus.hosts._query
    hosts = hosts.columns(*('name','state','last_time_up','plugin_output','services','next_check','last_check','service_description','check_interval'))
    results = hosts.call()
    allowed =  utils.get_contact_permissions(current_user.shinken_contact)
    results = [r for r in results if r['name'] in allowed['hosts']]

    for host in results:
        if host['name'] not in allowed['hosts']:
            continue
        services = {}
        for s in host['services']:
            if s in allowed['services']:
                service = livestatus.livestatus.services._query
                service = service.filter("host_name = %s"%host['name'])
                service = service.filter("description = %s"%s)
                service = service.columns(*('state','last_time_ok','plugin_output','next_check','last_check','host_name','description','check_interval'))
                services[s] = service.call()
        host['services'] = services

    from configservice import is_lock_owner
    return jsonify({'results': results, 'is_conf_owner': is_lock_owner()})

# TODO: now that sla use his own database instead of livestatus we should move all this stuff elsewhere
@app.route('/services/livestatus/disponibility/hostgroup')
@login_required
def get_hostgroup_disponibility():
    """ Return hosts disponibility """

    from sla import Sla

    start = request.args.get('start') or time.time() - 30 * 24 * 3600
    end = request.args.get('end') or time.time()
    firststate = int(request.args.get('firststate'))
    start = int(start)
    end = int(end)
    hosts = request.args.get('hosts')
    if hosts:
        allowed =  utils.get_contact_permissions(current_user.shinken_contact)
        if hosts not in allowed['hostgroups']:
            return False,403
        hosts = _get_hosts(hosts)
    else:
        hosts = _get_hosts()

    fulltime = end - start
    results= {}

    for h in hosts:
        logs = Sla.query\
                  .filter(Sla.host_name==h, Sla.service_description=='',Sla.time>=start, Sla.time<=end)\
                  .order_by(Sla.time.asc()).all()

        #0: up, 1: down, 2: unreachable, 3: Unknown
        timeline=[[firststate,start]]

        current = 0
        for v in logs:
            entry = [v.state,v.time]
            if entry[1] <= start and entry[1] > current:
                timeline[0][0] = entry[0]
                current = entry[1]
            elif entry[1] != timeline[-1][1] and entry[0] != timeline[-1][0]:
                timeline.append(entry)

        timeup = timedown = timeunreachable = timeunknown = 0

        i = 1
        while i < len(timeline):
            value = timeline[i][1] - timeline[i - 1][1]
            key = timeline[i - 1][0]

            if key == 0:
                timeup = timeup + value
            elif key == 1:
                timedown = timedown + value
            elif key == 2:
                timeunreachable = timeunreachable + value
            else:
                timeunknown = timeunknown + value

            i = i + 1

        value = end - timeline[-1][1]
        key = timeline[-1][0]
        if key == 0:
            timeup= timeup + value
        elif key == 1:
            timedown= timedown + value
        elif key == 2:
            timeunreachable= timeunreachable + value
        else:
            timeunknown = timeunknown + value

        results[h] = {
            'timeup': timeup,
            'timedown': timedown,
            'timeunreachable': timeunreachable,
            'timeunknown': timeunknown,
            'timeline': timeline
        }

    return jsonify({
        'start': start,
        'end': end,
        'fulltime': fulltime,
        'results': results
    })

@app.route('/services/livestatus/disponibility/service')
@login_required
def get_service_disponibility():
    """ Return overall disponibility """

    from sla import Sla

    start = request.args.get('start') or time.time() - 30 * 24 * 3600
    end = request.args.get('end') or time.time()
    start = int(start)
    end = int(end)
    service = request.args.get('service')
    firststate = int(request.args.get('firststate'))
    allowed =  utils.get_contact_permissions(current_user.shinken_contact)

    if service not in allowed['services']:
        return False,403

    fulltime = end - start

    logs = Sla.query\
              .filter(Sla.service_description==service,Sla.time>=start, Sla.time<=end)\
              .order_by(Sla.time.asc()).all()

    hlist = {}
    for entry in logs:
        if entry.host_name not in allowed['hosts']: continue
        if entry.host_name not in hlist: hlist[entry.host_name] = []
        hlist[entry.host_name].append(entry)
    results= {}

    for h in hlist:
        #sort entrys

        #0: up, 1: down, 2: unreachable, 3: Unknown
        timeline=[[firststate,start]]

        current = 0
        for v in hlist[h]:
            entry = [v.state,v.time]
            if entry[1] <= start and entry[1] > current:
                timeline[0][0] = entry[0]
                current = entry[1]
            elif entry[1] != timeline[-1][1] and entry[0] != timeline[-1][0]:
                timeline.append(entry)

        timeok = timewarn = timecritical = timeunknown = 0

        i = 1
        while i < len(timeline):
            value = timeline[i][1] - timeline[i - 1][1]
            key = timeline[i - 1][0]

            if key == 0:
                timeok = timeok + value
            elif key == 1:
                timewarn = timewarn + value
            elif key == 2:
                timecritical = timecritical + value
            else:
                timeunknown = timeunknown + value

            i = i + 1

        value = end - timeline[-1][1]
        key = timeline[-1][0]
        if key == 0:
            timeok= timeok + value
        elif key == 1:
            timewarn= timewarn + value
        elif key == 2:
            timecritical= timecritical + value
        else:
            timeunknown = timeunknown + value

        results[h] = {}
        results[h][service] = {
            'timeok': timeok,
            'timewarn': timewarn,
            'timecritical': timecritical,
            'timeunknown': timeunknown,
            'timeline': timeline
        }

    return jsonify({
        'start': start,
        'end': end,
        'fulltime': fulltime,
        'results': results
    })

@app.route('/services/livestatus/disponibility/host')
@login_required
def get_fullhost_disponibility():
    """ Return hosts disponibility """

    from sla import Sla

    start = request.args.get('start') or time.time() - 30 * 24 * 3600
    end = request.args.get('end') or time.time()
    firststate_host = int(request.args.get('firststate_host'))
    firststate_service = int(request.args.get('firststate_service'))
    start = int(start)
    end = int(end)
    host = request.args.get('host')
    if not host:
        return False,404

    allowed =  utils.get_contact_permissions(current_user.shinken_contact)
    if host not in allowed['hosts']:
        return False,403

    fulltime = end - start
    results= {}

    logs = Sla.query\
              .filter(Sla.host_name==host, Sla.time>=start, Sla.time<=end)\
              .order_by(Sla.time.asc()).all()

    slist = {}
    for l in logs:
        service = l.service_description if l.service_description != "" else "__HOST__"
        if service != "__HOST__" and service not in allowed['services']:
            continue
        if service not in slist: slist[service] = []
        slist[service].append(l)
    results= {}

    for s in slist:
        #0: up, 1: down, 2: unreachable, 3: Unknown
        timeline=[[firststate_service,start]] if s != "" else [[firststate_host,start]]

        current = 0
        for v in slist[s]:
            entry = [v.state,v.time]
            if entry[1] <= start and entry[1] > current:
                timeline[0][0] = entry[0]
                current = entry[1]
            elif entry[1] != timeline[-1][1] and entry[0] != timeline[-1][0]:
                timeline.append(entry)

            timeup = timedown = timeunreachable = timeunknown = 0

            i = 1
            while i < len(timeline):
                value = timeline[i][1] - timeline[i - 1][1]
                key = timeline[i - 1][0]

                if key == 0:
                    timeup = timeup + value
                elif key == 1:
                    timedown = timedown + value
                elif key == 2:
                    timeunreachable = timeunreachable + value
                else:
                    timeunknown = timeunknown + value

                i = i + 1

            value = end - timeline[-1][1]
            key = timeline[-1][0]
            if key == 0:
                timeup= timeup + value
            elif key == 1:
                timedown= timedown + value
            elif key == 2:
                timeunreachable= timeunreachable + value
            else:
                timeunknown = timeunknown + value

            results[s] = {
                'timeup': timeup,
                'timedown': timedown,
                'timeunreachable': timeunreachable,
                'timeunknown': timeunknown,
                'timeline': timeline
            }

    return jsonify({
        'start': start,
        'end': end,
        'fulltime': fulltime,
        'results': results
    })

@app.route('/services/livestatus/disponibility/get')
@login_required
def get_disponibility():
    """ Return hosts disponibility """

    from sla import Sla

    start = request.args.get('start') or time.time() - 365 * 24 * 3600
    start = int(start)
    end = request.args.get('end') or time.time()
    end = int(end)
    firststate = int(request.args.get('firststate'))
    host = request.args.get('host')
    if not host:
        abort(404)

    allowed =  utils.get_contact_permissions(current_user.shinken_contact)
    if host not in allowed['hosts']:
        abort(403)

    service = request.args.get('service') or ''
    if service and service not in allowed['services']:
        abort(403)

    logs = Sla.query\
              .filter(Sla.host_name==host, Sla.service_description==service, Sla.time>=start, Sla.time<=end)\
              .order_by(Sla.time.asc()).all()

    fulltime = end - start
    results= {}

    #0: up, 1: down, 2: unreachable, 3: Unknown
    timeline=[[firststate,start]]
    current = firststate
    for l in logs:
        if(l.state != current):
            entry = [l.state,l.time]
            current = l.state
            timeline.append(entry)

    timeup = timedown = timeunreachable = timeunknown = 0

    i = 1
    while i < len(timeline):
        value = timeline[i][1] - timeline[i - 1][1]
        key = timeline[i - 1][0]

        if key == 0:
            timeup = timeup + value
        elif key == 1:
            timedown = timedown + value
        elif key == 2:
            timeunreachable = timeunreachable + value
        else:
            timeunknown = timeunknown + value

        i = i + 1

    value = end - timeline[-1][1]
    key = timeline[-1][0]
    if key == 0:
        timeup= timeup + value
    elif key == 1:
        timedown= timedown + value
    elif key == 2:
        timeunreachable= timeunreachable + value
    else:
        timeunknown = timeunknown + value

    results = {
        'timeup': timeup,
        'timedown': timedown,
        'timeunreachable': timeunreachable,
        'timeunknown': timeunknown,
        'timeline': timeline
    }

    return jsonify({
        'start': start,
        'end': end,
        'fulltime': fulltime,
        'host': host,
        'service': service,
        'results': results
    })
