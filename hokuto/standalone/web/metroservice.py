""" Metrology data web services """

import re

from flask import jsonify, request
from flask.ext.login import login_required
from influxdb import InfluxDBClient

from . import app

def _create_connection():
    return InfluxDBClient(host='localhost', port=8086, database='shinken', username='shinken', password='shinken_test')

def _get_numeric_measurements(client):
    fielddata = client.query('show field keys');
    for m in fielddata.items():
        for f in m[1]:
            if f[u'fieldKey'] == u'value':
                yield m[0]
                break    

@app.route('/services/metrics')
@login_required
def get_new_metrics_list():
    # TODO : filter unathorized elements
    result = {}
    client = _create_connection()
    tagdata = client.query('show tag values with key in ("host_name", "service_description")')
    separator = getattr(app.config,'PROBENAME_SEP','[SEP]')
    measurements = list(_get_numeric_measurements(client))
    #print 'measurements : ' + str(measurements)

    for m in tagdata.items():
        # Do not use non-numeric metrics
        if m[0] not in measurements:
            print '-- not in measurements: SKIPPED!'
            continue
        # Extract host and service names
        host_names = []
        for pair in m[1]:
            if pair[u'key'] == u'host_name':
                host_names.append(pair[u'value'])
            if pair[u'key'] == u'service_description':
                service_description = pair[u'value']
        for host_name in host_names:
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
    probes = request.args.get('probes') # An array of strings, in the form "host/service/probe"
    start = request.args.get('start') or '-28d' # Retrieve the last 28 days by default
    end = request.args.get('end') or 'now'
    separator = getattr(app.config,'PROBENAME_SEP','[SEP]')

    parsed_probes = []
    results = {}
    influx = _create_connection()
    if isinstance(probes, basestring):
        probes = [probes]
    for pstring in  probes:
        parts = pstring.split(separator)
        if len(parts) != 3:
            app.logger.warning('Data was requested for invalid probe ID "{}"'.format(parts))
            continue
        parsed_host = parts[0]
        parsed_service = parts[1]
        parsed_metric = parts[2]

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
#select time, value from metric_mem_free where host_name='courtois' and service_description='RAM' and time >= now() - 7d and time <= now()

    return jsonify(results)

def _secure_query_string(value):
    """
    Secures a string so it can be used in an Influx query as a string constant
    """
    return "'" + value.replace("'", "\\'") + "'"

_secure_query_token_expr = None
def _secure_query_token(value):
    """
    Secures a string so it can be used as a VarRef in a InfluxDB query
    (like a column or table name for exemple)
    """
    global _secure_query_token_expr
    if not _secure_query_token_expr:
        # Matches any character that is not alphanumeric, nor _
        _secure_query_token_expr = re.compile('[\W]+', re.UNICODE)
    return _secure_query_token_expr.sub('', value)

_secure_query_date_expr = None
def _secure_query_date(value):
    """
    Turns a standard date specifier into a format that can be inserted into a InfluxDB WHERE clause
    Supported intpus are :
    - A number (timestamp)
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
        return str(numvalue)
    global _secure_query_date_expr
    if _secure_query_date_expr is None:
        _secure_query_date_expr = re.compile('^(\\+|\\-)\\w*(\\d+)\\w*(u|ms|s|m|h|d|w)$', re.UNICODE)
    match = _secure_query_date_expr.match(value)
    if match is not None:
        return 'now() {} {}{}'.format(match.group(1), match.group(2), match.group(3))
    return None
