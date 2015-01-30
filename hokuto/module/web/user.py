#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
# Clement Papazian, clement@omegacube.fr
# Francine NGuyen, paulette@omegacube.fr
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

""" Users controller
This module contains all the actions related to user management
"""


from datetime import datetime
import hashlib
import os
from on_reader.livestatus import livestatus


from flask import request, flash, url_for, redirect, render_template, abort
from flask.ext.babel import gettext as _, lazy_gettext as __
from flask.ext.login import login_user, login_required, logout_user, UserMixin, current_user
from wtforms import Form, TextField, PasswordField, BooleanField, validators, SelectField

from on_reader.livestatus import livestatus

from . import app, db, login_manager
from ajax import redirect_or_json, template_or_json
from utils import try_int, generate_salt

@login_manager.user_loader
def load_user(userid):
    """ Flask-Login user loading helper """
    return User.query.filter(User.username == userid).first()

class User(db.Model, UserMixin):
    """ User data model """
    """ User unique id. Read only. """

    id = db.Column('user_id', db.Integer, primary_key=True)

    """ User name. Unique among all the other users. Max. 50 chars """
    username = db.Column(db.String(50), unique=True)

    """ A boolean indicating is this user has all rights on the system """
    is_super_admin = db.Column(db.Boolean, default=False)

    """ A boolean indicating if the user can log in """
    is_disabled = db.Column(db.Boolean, default=False)

    create_date = db.Column('create_date', db.DateTime)
    change_date = db.Column('change_date', db.DateTime)

    __password = db.Column('password', db.String(64))
    __password_salt = db.Column('password_salt', db.String(32))

    """ User id shinken """
    shinken_contact = db.Column(db.String(50))


    def __init__(self, username, password, is_super_admin):
        """ This constructor should be for creating a new user in the system.
            Use SQLAlchemy's queries to get existing users.
        """
        self.username = username
        self.password = password
        self.is_super_admin = is_super_admin
        self.create_date = datetime.utcnow()
        self.change_date = self.create_date

        self.set_password(password)


    @classmethod
    def __hash_pass(cls, password, salt):
        hashed_password = hashlib.md5(salt + password).hexdigest()
        return hashed_password

    def __regenerate_salt(self):
        self.__password_salt = generate_salt(12)

    def set_password(self, password):
        """ Changes the password of the user """
        self.__regenerate_salt()
        newPass = User.__hash_pass(password, self.__password_salt)
        self.__password = newPass

    def check_password(self, password):
        """ Returns true if the provided password matches this user's
            stored password
        """
        passHash = User.__hash_pass(password, self.__password_salt)
        return passHash == self.__password

    # Flask-Login required methods
    def is_active(self):
        """ Returns True if the is_disabled member is False """
        return not self.is_disabled

    def get_id(self):
        """ Returns the username member """
        return self.username

class LoginForm(Form):
    """ Login page view model """
    username = TextField(__('Username'),
        [validators.Length(min=4,
                           max=25,
                           message=__('Username should contain between 4 and 20 characters'))])
    password = PasswordField(__('Password'),
        [validators.Required(message=__('Password is required'))])

@app.route('/login', methods=['POST', 'GET'])
def login():
    """ Action that logs a user in """
    form = LoginForm(request.form)
    redir = request.args.get('next')
    if request.method == 'POST' and form.validate():
        # Try to find the user by name
        user = User.query.filter(
            User.username == form.username.data).first()
        if user:
            # User exists, check password
            if user.check_password(form.password.data):
                login_user(user)
                if(request.args.get('next')):
                    return redirect(request.args['next'])
                else:
                    return redirect('/')
        flash(_('Invalid username or password'), 'error')

    return template_or_json('user/login.html', form=form, redir=redir)

@app.route('/logout')
@login_required
def logout():
    """ Action that logs a user out """
    logout_user()
    return redirect_or_json(url_for('login'), status='ok')

@app.route('/list-users')
@app.route('/list-users/<page>')
@login_required
def list_users(page=None):
    """ Action that displays a list of existing users """
    page = try_int(page, 1)
    list = User.query.paginate(page)
    clist = {c : livestatus.contacts[c].email for c in livestatus.contacts}
    return render_template('user/list_users.html', list=list,contacts=clist)

class EditUserForm(Form):
    """ User modification page view model """
    username = TextField(__('Username'),
        [validators.Length(min=4,
                           max=25,
                           message=__('Username should contain between 4 and 20 characters'))])
    password = PasswordField(__('Password'))
    confirm_password = PasswordField(__('Confirm password'),
        [validators.EqualTo('password', message=__('Passwords must match'))])
    is_super_admin = BooleanField(__('Super Administrator'))
    is_disabled = BooleanField(__('Disabled'))
    shinken_contact = SelectField(__('Contact Shinken'))

    def __init__(self, formvalues):
        super(EditUserForm, self).__init__(formvalues)

    #   Contacts drop down list
        clist = [(c, c) for c in livestatus.contacts]
        clist.insert(0, ('None', 'None'))
        self.shinken_contact.choices = clist

    # TODO : Put complete arguments list
    #super(Form, self).__init__(formdata)

@app.route('/edit-user', methods=['GET', 'POST'])
@app.route('/edit-user/<userid>', methods=['GET', 'POST'])
def edit_user(userid=None):
    """ Action that edits an existing user or creates a new one """
    # True if user is new
    is_new = False
    is_admin = False
    if current_user.is_anonymous():
        is_admin = False
    elif current_user.is_super_admin:
        is_admin = True

    userid = try_int(userid)
    if userid != None and current_user.is_anonymous():
        abort(403)
    elif userid != None and not is_admin and not (current_user.id == userid):
        abort(403)
    if userid == None:
        is_new = True

    form = EditUserForm(request.form)
    if not userid:
        form.password.validators.append(validators.Required(message=_('Password is required')))
    if request.method == 'POST' and form.validate():
        if userid:
            # Update existing
            user = User.query.get(userid)
            user.username = form.username.data
            user.is_super_admin = form.is_super_admin.data if is_admin else False
            user.is_disabled = form.is_disabled.data
            user.shinken_contact = form.shinken_contact.data if is_admin else user.shinken_contact
            if form.password.data:
                user.set_password(form.password.data)
            db.session.commit()
        else:
            # Create new
            if User.query.filter_by(username= form.username.data).first():
                flash(_('Username already taken!'),'error')
                return redirect(url_for('edit_user'))
            user = User(form.username.data,
                        form.password.data,
                        form.is_super_admin.data  if is_admin else False)
            user.is_disabled = form.is_disabled.data
            user.shinken_contact = form.shinken_contact.data if is_admin else 'None'
            db.session.add(user)
            db.session.commit()
        if current_user.is_anonymous():
            return redirect(url_for('login'))
        return redirect(url_for("list_users"))
    else:
        if userid:
            # Fill the form with user info
            user = User.query.filter(
                User.id == userid).first()
            form.username.data = user.username
            form.is_disabled.data = user.is_disabled
            form.is_super_admin.data = user.is_super_admin
            form.shinken_contact.data = user.shinken_contact

        return render_template('user/edit_user.html', form=form, isnew=is_new, isadmin=is_admin)

@app.route('/block-user/<userid>', methods=['GET', 'POST','PUT'])
@login_required
def disable_user(userid=None):
    """ Disable an user """
    userid = try_int(userid)
    if not current_user.is_super_admin or userid == current_user.id:
        abort(403)
    user = User.query.get(userid)
    user.is_disabled = not user.is_disabled
    db.session.commit()
    return 'Ok',200

@app.route('/delete-user/<userid>',methods=['DELETE'])
@login_required
def destroy_user(userid=None):
    """ Remove an user entry """
    userid = try_int(userid)
    if not current_user.is_super_admin or userid == current_user.id:
        abort(403)
    user = User.query.get(userid)
    db.session.delete(user)
    db.session.commit()
    return 'Ok',200
