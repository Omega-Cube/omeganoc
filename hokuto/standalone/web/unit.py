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

from . import app, db, login_manager
from flask import render_template, flash, redirect, request, jsonify, url_for
from flask.ext.login import login_user, login_required, logout_user, UserMixin, current_user
from sqlalchemy.sql import text
from wtforms import Form, TextField, IntegerField, SelectField, validators
from wtforms.validators import DataRequired
from utils import try_int
from demo import is_in_demo, create_demo_response, create_demo_redirect

from ajax import jsondump

class Unit(db.Model):
    """ Units data model """
    id = db.Column('id', db.Integer, primary_key=True)
    name = db.Column('name', db.String(32), nullable=False)
    symbol = db.Column('symbol',db.String(16), nullable=True)
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

    def __str__(self):
        return self.name

# FORMS
class AddUnitForm(Form):
    """ Unit add page model """
    name= TextField('name',
                    [validators.Length(min=1, max=32, message="Name should contain between 1 and 32 characters")])
    symbol= TextField('symbol',
                      [validators.Length(min=1, max=8, message="Symbol should contain between 1 and 8 characters")])
    factor= SelectField("factor", choices=[('0','None'),('1000','1000'),('1024','1024')])

# PAGES
@app.route('/units')
@login_required
def manage_units():
    """ Units management page """
    units = Unit.query.filter(Unit.name != 'None').order_by(Unit.name).all()
    return render_template('unit.html', units=units)


# SERVICES
@app.route('/units/add', methods=['GET','POST'])
@login_required
def add_unit():
    """ Save a new unit to the database, popin mode """
    if not current_user.is_super_admin:
        abort(403)

    form= AddUnitForm(request.form)

    if request.method == 'POST':
        #No adding in demo mode!
        if is_in_demo():
            return create_demo_response()
        if Unit.query.filter_by(name= form.name.data).first():
            # we call form.validate to build up all errors from the form
            form.validate()
            if not 'name' in form.errors:
                form.errors['name'] = []
            form.errors['name'].append("Name "+form.name.data+" already taken")

        elif form.validate():
            name = request.form.get('name')
            symbol = request.form.get('symbol')
            factor = request.form.get('factor') if request.form.get('factor') else None
            magnitudes = ['','k','M','G','T'] if request.form.get('factor') else None

            un = Unit(name, symbol, factor, magnitudes)
            db.session.add(un)
            db.session.commit()
            return jsonify({
                'name': name,
                'symbol': symbol,
                'factor': factor,
                'magnitudes': magnitudes
            }),201

        return jsonify(form.errors),400

    return render_template('partials/unit_form.html', form=form)

@app.route('/units/create', methods=['GET','POST'])
@login_required
def create_unit():
    """ Save a new unit to the database from the manager """
    if not current_user.is_super_admin:
        abort(403)

    form= AddUnitForm(request.form)

    if request.method == 'POST':
        #No adding in demo mode!
        if is_in_demo():
            return create_demo_redirect()
        if Unit.query.filter_by(name= form.name.data).first():
            # we call form.validate to build up all errors from the form
            form.validate()
            if not 'name' in form.errors:
                form.errors['name'] = []
            form.errors['name'].append("Name "+form.name.data+" already taken")

        elif form.validate():
            name = request.form.get('name')
            symbol = request.form.get('symbol')
            factor = request.form.get('factor') if request.form.get('factor') else None
            magnitudes = ['','k','M','G','T'] if request.form.get('factor') else None

            un = Unit(name, symbol, factor, magnitudes)
            db.session.add(un)
            db.session.commit()
            return redirect(url_for('manage_units'))

    return render_template('create-unit.html', form=form)


@app.route('/units/edit/<unitid>',methods=['GET','POST'])
@login_required
def edit_unit(unitid):
    """ Edit an unit """
    if not current_user.is_super_admin:
        abort(403)

    unit= Unit.query.get(unitid)
    if not unit:
        return "Unit doesn't exist",404
    form= AddUnitForm(request.form,unit)
    if request.method == 'POST' and form.validate():
        #No editing in demo mode!
        if is_in_demo():
            return create_demo_redirect()
        name = request.form.get('name')
        symbol = request.form.get('symbol')
        factor = request.form.get('factor') if request.form.get('factor') else None
        magnitudes = ['','k','M','G','T'] if request.form.get('factor') else None

        if name:
            unit.name = name
        if symbol:
            unit.symbol = symbol
        if factor:
            unit.factor = int(factor)
            unit.magnitudes = json.dumps(magnitudes)
        else:
            unit.magnitudes = None

        db.session.commit()
        return redirect(url_for('manage_units'))

    elif request.method == 'POST': return "Form invalid!",500

    return render_template('edit-unit.html', form=form, unit=unit)


@app.route('/units/all', methods=['GET'])
@login_required
def get_units():
    """ Return units list """
    return jsondump({ row.name : {
                'symbol': row.symbol,
                'factor': row.factor,
                'magnitudes': row.magnitudes
                } for row in Unit.query.all()})

@app.route('/units/delete/<unitid>',methods=['DELETE'])
@login_required
def delete_unit(unitid):
    """ Delete an unit """
    unitid = try_int(unitid)
    if not current_user.is_super_admin:
        abort(403)
    unit = Unit.query.get(unitid)
    if unit.name == 'None':
        abort(403)
    if not unit:
        abort(404)
     # No removing in demo mode!
    if is_in_demo():
        return create_demo_response()
    db.session.delete(unit)
    # Set None unit to all existing dashboards with the deleting unit
    db.engine.execute(text("UPDATE parts_conf SET value = 'None' where key like '%|unit' and value = :unit;"),{'unit': unit.name});
    db.session.commit()
    return 'Ok',204
