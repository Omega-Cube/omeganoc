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

""" SLA data model """

from . import db
import json

class Sla(db.Model):
    """ SLA data model """
    # IMPORTANT : If you change the structure of this table, make sure the query in
    # the broker module (hokuto/module/module.py, manage_log_brok method) still works 
    # with the new structure
    id = db.Column('id', db.Integer, primary_key=True)
    host_name = db.Column('host_name', db.String(128), nullable=False)
    service_description = db.Column('service_description',db.String(32), nullable=True)
    time = db.Column('time',db.Integer,nullable=False)
    state = db.Column('state',db.Integer,nullable=True)

    def __init__(self, host_name, service_description, time, state):
        """ Init """
        self.host_name = host_name
        self.service_description = service_description
        self.time = time
        self.state = state

    def __repr__(self):
        return '<%r.%r %d:%d>'%(self.host_name,self.service_description,self.state,self.time)
