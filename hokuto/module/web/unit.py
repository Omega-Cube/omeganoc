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

""" Units data model """

import json

from . import db

class Unit(db.Model):
    """ Units data model """
    id = db.Column('id', db.Integer, primary_key=True)
    name = db.Column('name', db.String(128), nullable=False)
    symbol = db.Column('symbol',db.String(32), nullable=True)
    factor = db.Column('factor',db.Integer,nullable=True)
    magnitudes = db.Column('magnitudes',db.String(256),nullable=True)

    def __init__(self, name, symbol, factor, magnitudes):
        """ Init """
        self.name = name
        self.symbol = symbol
        self.factor = factor
        if(magnitudes):
            self.magnitudes = json.dumps(magnitudes)
        else:
            self.magnitudes = False

