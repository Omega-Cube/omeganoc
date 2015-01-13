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

""" This module handles the loading of
    all the dashboard widgets related stuff
"""

import importlib
import os
import os.path

from flask import abort, send_file
from flask.ext.login import login_required
from sqlalchemy import Table, select, exists

from . import app, db
from ajax import jsondump

## STRUCTURES

_widgetbasedir = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'static/widgets')

class Widget(object):
    def __init__(self, name):
        self._hasjs = None  # Contains the path the the module's JS file,
                            # or an empty strig if there is no JS, or None
                            # if the file has not been checked yet
        self._hascss = None # Same than above but for the CSS file
        self._module = None # The python module associated with this widget
        self._humanname = None # Human-readable name, retrieved from the "hname" variable found in the widget's module
        self.name = name
        self._basedir = _getwidgetpath(name)

    def _initjs(self):
        if self._hasjs is None:
            jspath = os.path.join(self._basedir, self.name + '.js')
            if os.path.isfile(jspath):
                self._hasjs = jspath
            else:
                self._hasjs = ''

    def _initcss(self):
        if self._hascss is None:
            csspath = os.path.join(self._basedir, self.name + '.css')
            if os.path.isfile(csspath):
                self._hascss = csspath
            else:
                self._hascss = ''

    def hasjs(self):
        self._initjs()
        return bool(self._hasjs)

    def hascss(self):
        self._initcss()
        return bool(self._hascss)

    def csspath(self):
        if self.hascss():
            return self._hascss
        else:
            return None

    def jspath(self):
        if self.hasjs():
            return self._hasjs
        else:
            return None

    def loadmoduledata(self):
        if self._module is None:
            self._loadModule()

    def _loadModule(self):
        modname = _getmodulename(self.name)
        #module = __import__(modname)
        module = importlib.import_module(modname, __package__)
        self.humanname = module.hname
        self.min_width = getattr(module, 'min_width', 1)
        self.max_width = getattr(module, 'max_width', 1)
        self.min_height = getattr(module, 'min_height', 1)
        self.max_height = getattr(module, 'max_height', 1)

    @classmethod
    def loadfromdir(cls, dirname):
        # Directory name is the module name
        (root, name) = os.path.split(dirname)

        if Widget.is_valid_widget_dir(dirname):
            return Widget(name)
        else:
            return None

    @classmethod
    def is_valid_widget_dir(cls, dirname):
        """ Checks that the specified folder contains the mandatory files
            for a widget folder
        """
        (root, name) = os.path.split(dirname)
        pyname = os.path.join(dirname, '__init__.py')
        jsname = os.path.join(dirname, name + '.js')
        return os.path.isfile(pyname) and os.path.isfile(jsname)


## ACTION METHODS

@app.route('/dashboards/widgets')
@login_required
def get_widgets_list():
    """ This action method sends a JSON array containing a list of all available widget names """
    # Note : These member names will be used as-is from all the scripts on client side. Change with care.
    return jsondump([{'id':w.name,
                      'name':w.humanname,
                      'minWidth':w.min_width,
                      'maxWidth':w.max_width,
                      'minHeight':w.min_height,
                      'maxHeight':w.max_height,
                      'hasCss':w.hascss()} for w in load_widgets_list(True)], True)

@app.route('/widgets/<regex("[a-zA-Z_]+"):wname>.js')
@login_required
def load_widget_js(wname):
    """ This action simply the contents of a widget's javascript file """
    widget = Widget.loadfromdir(_getwidgetpath(wname))
    if widget is None or not widget.hasjs():
        abort(404)
    return send_file(widget.jspath())

@app.route('/widgets/<regex("[a-zA-Z_]+"):wname>.css')
@login_required
def load_widget_css(wname):
    """ This action returns the contents of a widget's CSS file """
    widget = Widget.loadfromdir(_getwidgetpath(wname))
    if(widget is None or not widget.hascss()):
        abort(404)
    return send_file(widget.csspath());

# I tried serving the static plugin files through a blueprint's static route
# but couln't make it working :/
# widgetbp = Blueprint('widgets', __name__, static_folder='basicchart')
# app.register_blueprint(widgetbp)

## CORE METHODS

def load_widgets_list(autoload_module=False):
    """ Looks up all the valid modules installed in the app """

    result = []

    basedepth = _widgetbasedir.count(os.sep)

    for path in os.listdir(_widgetbasedir):
        a_path = os.path.join(_widgetbasedir, path)
        if not os.path.isdir(a_path):
            continue

        depth = a_path.count(os.sep) - basedepth
        if depth != 1:
            continue

        w = Widget.loadfromdir(a_path)
        if w is not None:
            if autoload_module:
                w.loadmoduledata()
            result.append(w)

    return result

def _getwidgetpath(name):
    """ Returns the full physical path to where a widget should be located at """
    return os.path.abspath(os.path.join(_widgetbasedir, name))

def _getmodulename(name):
    """ Returns the module name corresponding to a specified widget name """
    return '.static.widgets.' + name
