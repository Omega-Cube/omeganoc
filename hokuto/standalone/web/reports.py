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

""" The report part (SLA and logs tools) """

# WIP: This section is not functional yet

from flask import render_template, request, abort
from flask.ext.login import login_required, current_user
from . import app, utils

@app.route('/logs')
@login_required
def logs():
    """ reports logs landing page """
    return render_template("logs.html")

@app.route('/availability')
@login_required
def availability():
    """ SLA landing page """
    permissions = utils.get_contact_permissions(current_user.shinken_contact)
    return render_template("availability.html", permissions=permissions)
