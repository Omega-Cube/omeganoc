#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Francine NGuyen, francine@omegacube.fr
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

""" This controller manages shinken configuration tables """ 


from flask import render_template
from flask.ext.login import login_required

from . import app
from on_reader import systemstructure
from ajax import request_is_ajax

@app.route('/config')
@app.route('/config/<choix>')
@login_required

def table(choix=None):
    """ This action displays a table containing the specified configuration element type """
    data=[]
    if choix == 'contact':
        data = systemstructure.contacts
    elif choix == 'contact_group':
        data = systemstructure.contactgroups
    elif choix == 'service':
        data = systemstructure.services
    elif choix == 'service_group':
        data = systemstructure.servicegroups
    elif choix == 'host':
        data = systemstructure.hosts
    elif choix == 'host_group':
        data = systemstructure.hostgroups
    elif choix == 'command':
        data = systemstructure.commands
    elif choix == 'host_dependency':
        data = systemstructure.hostdependencies
    elif choix == 'service_dependency':
        data = systemstructure.servicedependencies
    else:
        choix = None

    if request_is_ajax():
        return render_template('config/table_conf/%s.html' % choix, data=data)
    else:
        return render_template('config/table_conf.html', data=data, choix=choix )
