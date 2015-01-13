#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
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

""" Ajax helpers
This module contains miscanellous tools to be used when working with Ajax requests
""" 

from flask import request, jsonify, json, render_template, get_flashed_messages, redirect

def request_is_ajax():
    """ Determines if an incoming request is an AJAX 
        (XMLHttpRequest) request.
    """
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'

def template_or_json(template_name, **context):
    """ Returns the rendered template is the request is traditionnal request, 
        or a JSON version of the context if the request is an AJAX request.
        
        When in AJAX mode, this function also automatically creates a flash
        member in the json object, containing an array of {message, category}
        objects.
    """
    if request_is_ajax():
        msg = get_flashed_messages(with_categories=True)
        context.flash = [{message:m[1], category:m[0]} for m in msg]
        return jsonify(context)
    else:
        return render_template(template_name, **context)

def redirect_or_json(location, code = 302, **context):
    """ Redirects the user to the specified location if the request is a
        traditionnal request, or returns a JSON version of json_object
        if the request is an AJAX request.
        This function does not forward flash messages.
    """
    if request_is_ajax():
        return jsonify(context)
    else:
        return redirect(location, code)

def jsondump(data, isarray=False):
    """ Serializes the provided data into json
        If no data is present, the function will return an empty
        object, or an empty array if isarray is true.
    """
    result = json.dumps(data)
    if not result:
        if isarray:
            return "[]"
        else:
            return "{}"
    else:
        return result
