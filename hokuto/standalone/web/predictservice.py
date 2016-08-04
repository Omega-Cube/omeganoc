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

""" Webservices used for predict features """

import json

from flask import request,jsonify
from flask.ext.login import login_required, current_user
from on_reader.predict import PredictReader

from . import app, utils

def _getreader():
    """ Returns an instance of the prediction data reader """
    db_path = app.config.get('NANTO_DATABASE', None)
    if db_path is None:
        app.logger.debug('No prediction db info')
        return None
    return PredictReader(db_path)

@app.route('/services/predict/forecast')
@login_required
def get_forecast():
    """
    Return trending forecasting from given probe
    If the user have no predict table will return 403
    """
    probes = request.args.getlist('probes')
    if len(probes) == 0:
        return jsonify({})
    results= {}
    reader = _getreader()
    if reader is None or reader.forecast_available() is None:
        app.logger.debug('Forecast data not available')
        return jsonify({})
    for probe in probes:
        try:
            results[probe] = reader.forecast('.'.join(probe.split(getattr(app.config,'GRAPHITE_SEP','[SEP]'))))
        except Exception as ex:
            app.logger.warning('An error occured while trying to read forecast results for probe {0} !'.format(probe))
            app.logger.warning(ex)
            # Just skip this probe
    return jsonify(results)
