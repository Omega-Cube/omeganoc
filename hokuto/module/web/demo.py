#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2015 Omega Cube and contributors
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

""" Utilities related to the demo mode """

from flask import render_template, redirect, url_for

from . import app

@app.route('/demo-landing')
def demo_landing():
    """ This page tells the user that he tried to use a feature that is not available in demo mode """
    return render_template('demo-landing.html')

def is_in_demo():
    """ Returns True if the demo mode is enabled, False otherwise """
    return app.config.get('DEMO', False) == True

def create_demo_response():
    """ Creates a standard response sent to the client when an AJAX request cannot be fullfilled because it is not available in demo mode """
    return 'Not implemented in the demo version', 501

def create_demo_redirect():
    """ Creates a standard response sent to the client when a page is not available because we're in demo mode """
    return redirect(url_for('demo_landing'))
