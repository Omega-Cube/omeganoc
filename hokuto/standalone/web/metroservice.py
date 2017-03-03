# -*- coding: utf-8 -*-

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2016 Omega Cube and contributors
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


""" Metrology data web services """

import re

from flask import jsonify, request
from flask.ext.login import login_required, current_user
from influxdb import InfluxDBClient

from . import app, utils

class InfluxConfigurationException(Exception):
    """ An exceptoin raised when the InfluxDB configuration has a problem """
    def __init__(self, message):
        self.message = message
    def __str__(self):
        return self.message

def _create_connection():
    host = app.config.get('INFLUX_HOST')
    port = app.config.get('INFLUX_PORT')
    db = app.config.get('INFLUX_DATABASE')
    user = app.config.get('INFLUX_USERNAME')
    password = app.config.get('INFLUX_PASSWORD')

    missing = []
    if host is None:
        missing.append('INFLUX_HOST')
    if port is None:
        missing.append('INFLUX_PORT')
    if db is None:
        missing.append('INFLUX_DATABASE')
    if user is None:
        missing.append('INFLUX_USERNAME')
    if password is None:
        missing.append('INFLUX_PASSWORD')
    if len(missing) > 0:
        raise InfluxConfigurationException('Missing InfluxDB configuration directives: ' + ', '.join(missing))

    try:
        port = int(port)
    except ValueError:
        raise InfluxConfigurationException('The current configuration value for INFLUX_PORT ("{}") is not a valid number'.format(port))

    return InfluxDBClient(host=host, port=port, database=db, username=user, password=password)

def _get_numeric_measurements(client):
    fielddata = client.query('show field keys');
    for m in fielddata.items():
        for f in m[1]:
            if f[u'fieldKey'] == u'value':
                yield m[0]
                break    

_flatten_expr = None
def _flatten_name(name):
    """ Removes any non-alphanumeric character from a string, by replacing them by underscores """
    global _flatten_expr
    if _flatten_expr is None:
        _flatten_expr = re.compile(r'[^\w-]');
    return _flatten_expr.sub('_', name)

@app.route('/services/metrics')
@login_required
def get_metrics_list():
    result = {}
    client = _create_connection()
    tagdata = client.query('show tag values with key in ("host_name", "service_description")')
    measurements = list(_get_numeric_measurements(client))

    permissions = utils.get_contact_permissions(current_user.shinken_contact)

    for m in tagdata.items():
        # Do not use non-numeric metrics
        if m[0] not in measurements:
            continue
        # Extract host and service names
        host_names = []
        for pair in m[1]:
            if pair[u'key'] == u'host_name':
                host_names.append(pair[u'value'])
            if pair[u'key'] == u'service_description':
                service_description = pair[u'value']

        is_host_service = service_description.upper() == '__HOST__'

        # Skip the service if it's not available to the user (except for __HOST__, which is handled by the authorized hosts list)
        if not is_host_service and service_description not in permissions['services']:
            continue # This service is not available to this user; skip it

        for host_name in host_names:
            # If this is the host service, exclude it if that host is only allowed because of its contained services
            if is_host_service and (host_name in permissions['hosts_with_services'] or host_name not in permissions['hosts']):
                continue

            # check if the host is already in the results
            if host_name not in result:
                result[host_name] = {}
            # Add the service into the host
            if service_description not in result[host_name]:
                result[host_name][service_description] = {}
            # Add the probe
            metric_name = m[0][0]
            if metric_name.startswith('metric_'):
                metric_name = metric_name[7:]
            result[host_name][service_description][metric_name] = host_name + '.' + service_description + '.' + metric_name
    return jsonify(result)

@app.route('/services/metrics/values')
@login_required
def get_metric_values():
    # TODO : Add security checks
    # Read query string arguments
    probes = request.args.getlist('probes') # An array of strings, in the form "host/service/probe"
    start = request.args.get('start') or '-28d' # Retrieve the last 28 days by default
    end = request.args.get('end') or 'now'
    separator = getattr(app.config,'PROBENAME_SEP','[SEP]')
    results = {}
    permissions = utils.get_contact_permissions(current_user.shinken_contact)

    if probes is not None:
        parsed_probes = []
        influx = _create_connection()
        for pstring in  probes:
            parts = pstring.split(separator)
            if len(parts) != 3:
                app.logger.warning('Data was requested for invalid probe ID "{}"'.format(parts))
                continue
            parsed_host = parts[0]
            parsed_service = parts[1]
            parsed_metric = parts[2]

            # Check that we are allowed to access that probe
            if parsed_service.upper() == '__HOST__':
                if parsed_host in permissions['hosts_with_services'] or parsed_host not in permissions['hosts']:
                    app.logger.info('No permissions to send data for service "{}" to user "{}"'.format(pstring, current_user))
                    continue
            elif parsed_service not in permissions['services']:
                app.logger.info('No permissions to send data for service "{}" to user "{}"'.format(pstring, current_user))
                continue

            query = 'select time, value from {} where host_name={} and service_description={} and time >= {} and time <= {}'.format(
                _secure_query_token('metric_' + parsed_metric), 
                _secure_query_string(parsed_host), 
                _secure_query_string(parsed_service), 
                _secure_query_date(start), 
                _secure_query_date(end))
            app.logger.debug('influx query: ' + query)
            data = influx.query(query, epoch='s')
            results[pstring] = {
                'host': parsed_host,
                'service': parsed_service,
                'metric': parsed_metric,
                'values': list(data.get_points())
            }
    return jsonify(results)

@app.route('/services/logs')
@login_required
def get_logs():
    """ This action fetches log entries for the specified service instances """
    # Array of host/service names, separated by the standard separator
    target_names = request.args.getlist('targets')

    if len(target_names) == 0:
        return "Missing arguments", 400

    if len(target_names) == 0:
        return "", 200

    # Get the necessary configuration values
    permissions = utils.get_contact_permissions(current_user.shinken_contact)
    separator = getattr(app.config, 'PROBENAME_SEP', '[SEP]')

    # Build the Influx query
    result = {}
    where_parts = []
    for tstring in target_names:
        # Extract start / end
        pipe_pos = tstring.rfind('|')
        if pipe_pos == -1:
            return "Invalid target specification (end pipe): " + tstring, 400
        end = tstring[pipe_pos + 1:]
        tstring = tstring[:pipe_pos]
        pipe_pos = tstring.rfind('|')
        if pipe_pos == -1:
            return "Invalid target specification (start pipe): " + tstring, 400
        start = tstring[pipe_pos + 1:]
        tstring = tstring[:pipe_pos]
        # Parse name
        parts = tstring.split(separator)
        if len(parts) != 2:
            return 'Invalid target name: ' + tstring, 400
        [parsed_host, parsed_service] = parts

        # Check permissions
        if parsed_service.upper() == '__HOST__':
            if parsed_host in permissions['hosts_with_services'] or parsed_host not in permissions['hosts']:
                app.logger.info('No permissions to send logs for service "{}" to user "{}"'.format(tstring, current_user))
                continue
        elif parsed_service not in permissions['services']:
            app.logger.info('No permissions to send logs for service "{}" to user "{}"'.format(tstring, current_user))
            continue

        if parsed_host not in result:
            result[parsed_host] = {}

        if parsed_service not in result[parsed_host]:
            result[parsed_host][parsed_service] = []

        secured_start = _secure_query_date(start)
        if secured_start is None:
            return 'Invalid start date for element "' + tstring + '": "' + start + '"', 400
        secured_end = _secure_query_date(end)
        if secured_end is None:
            return 'Invalid end date for element ' + tstring + '": "' + end + '"', 400
        where_parts.append('(host_name={} AND service_description={} AND time > {} AND time < {})'.format(
            _secure_query_string(parts[0]),
            _secure_query_string(parts[1]),
            secured_start,
            secured_end))
    if len(where_parts) == 0:
        return "", 200

    # Execute the query
    query = "SELECT time, host_name, service_description, output, state, alert_type FROM EVENT"
    query = query + " WHERE state_type='HARD' AND ("
    query = query + ' OR '.join(where_parts) + ')'
    app.logger.debug('Influx query: ' + query)
    client = _create_connection()
    data = client.query(query, epoch='s')

    # Gather and return results
    for data_point in data.get_points():
        host_name = data_point['host_name']
        service_description = data_point['service_description']

        result[host_name][service_description].append({
            'time': data_point['time'],
            'output': data_point['output'],
            'state': data_point['state'],
            'alert_type': data_point['alert_type']
        })
    return jsonify(result)

def _secure_query_string(value):
    """
    Secures a string so it can be used in an Influx query as a string constant
    """
    return "'" + value.replace("'", "\\'") + "'"

def _secure_query_token(value):
    """
    Secures a string so it can be used as a VarRef in a InfluxDB query
    (like a column or table name for exemple)
    """
    return '"' + value.replace('"', '') + '"'

_secure_query_date_expr = None
def _secure_query_date(value):
    """
    Turns a standard date specifier into a format that can be inserted into a InfluxDB WHERE clause
    Supported intpus are :
    - A number (timestamp in seconds)
    - Litteral 'now' string
    - A relative date specifier, relative to now, for example -30d.
      Supported units are u, ms, s, m, h, d, w
    """
    if value == 'now':
        return 'now()'
    numvalue = -1
    try:
        numvalue = int(value)
    except ValueError:
        pass # If we can't convert to an int we'll try alternative formats below
    if numvalue > 0:
        return str(numvalue) + 's' #All service endpoints accepts second precision timestamps by default
    global _secure_query_date_expr
    if _secure_query_date_expr is None:
        _secure_query_date_expr = re.compile('^(\\+|\\-)\\w*(\\d+)\\w*(u|ms|s|m|h|d|w)$', re.UNICODE)
    match = _secure_query_date_expr.match(value)
    if match is not None:
        return 'now() {} {}{}'.format(match.group(1), match.group(2), match.group(3))
    app.logger.warn('Invalid date input: ' + str(value))
    return None
