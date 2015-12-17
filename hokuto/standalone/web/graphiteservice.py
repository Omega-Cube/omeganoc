#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Nicolas Lantoing, nicolas@omegacube.fr
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

""" Graphite related web services """

import json
import re

from time import time,strftime,gmtime
from flask import render_template,request,jsonify
from flask.ext.login import login_required, current_user
from graphitequery import storage, query

from . import app, utils

def _parse_metrics(query,store):
    """ Parse recursively all metrics at the given level """
    results= {}
    metrics= store.find(query)
    for m in metrics:
        if m.is_leaf:
            results[m.name]=m.path
        else:
            stick= _parse_metrics(m.path+'.*',store)
            if len(stick):
                results[m.name]=stick
            else:
                results[m.name]=m.path
    return results

def _format_time(timestamp):
    """ Convert a timestamp to a formated string for query requests  """
    return strftime("%H:%M_%Y%m%d" ,gmtime(timestamp))

#TODO: Removeme?
def _parse_query_result(query):
    """ return a correctly formated array """
    return query.getInfo()

@app.route('/services/data/get/metrics/')
@login_required
def get_metrics_list():
    """ Return a list of all available metrics for the current user """

    store= storage.Store()
    metrics= _parse_metrics('*',store)

    # Remove forbidden hosts and services from the request
    permissions= utils.get_contact_permissions(current_user.shinken_contact)

    reg = re.compile(r'\W')
    tmp = {}
    for m in metrics:
        metric = next((i for i in permissions['hosts'] if i == m), False)
        if metric:
            if isinstance(metrics[m],dict):
                for s in metrics[m]:
                    if('__HOST__' == s and metric not in permissions['hosts_with_services']):
                        service = '__HOST__'
                    else:
                        service = next((i for i in permissions['services'] if i == s), False)
                    if service:
                        if metric not in tmp:
                            tmp[metric] = {}
                        tmp[metric][service] = metrics[m][s]

            else:
                tmp[metric] = metrics[m]

    metrics = tmp
    return jsonify(metrics)

@app.route('/services/data/get/')
@login_required
def data_get():
    """ Get data from graphite """

    shinken_contact = current_user.shinken_contact
    permissions= utils.get_contact_permissions(shinken_contact)
    probes = json.loads(request.args.get('probes'))
    start = request.args.get('from') or time() - 3600 * 24 * 28
    end = request.args.get('until') or time()
    start = int(start)
    end = int(end)
    data = {}
    separator = getattr(app.config,'GRAPHITE_SEP','[SEP]')
    for probe in probes:
        #check if the current user is allowed to retreive probe's data
        tmp= probe.split(separator)
        checkHost= next((i for i in permissions['hosts'] if i == tmp[0]), False)
        checkService= next((i for i in permissions['services'] if i == tmp[1]), False)
        if('__HOST__' == tmp[1]):
            if tmp[0] not in permissions['hosts_with_services']:
                checkService = '__HOST__'
        if not checkHost or not checkService:
            data[probe] = {
                'error': 'Shinken contact %s is not allowed to retreive data from %s.%s'%(shinken_contact,tmp[0],tmp[1]),
                'code': 403
            }
            continue

        results= query.query(**{'target': '.'.join(tmp), 'from': _format_time(start), 'until': _format_time(end)})
        if(len(results)):
            data[probe] = _parse_query_result(results[0])
        else:
            data[probe] = {
                'error': 'No data found for %s'%probe,
                'code': 404
            }

    return jsonify(data);

