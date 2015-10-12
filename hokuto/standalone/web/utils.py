#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
# Clement Papazian, clement@omegacube.fr
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

""" Contains generic-purpose utilities that may be useful in the project """ 

import exceptions
import StringIO
import random
import sys
from on_reader import livestatus
from contextlib import contextmanager


def try_int(string, default=None):
    """ Converts a string to an integer.
    If the string does not contain a valid number, 
    then the function returns the value of the default parameter.
    """
    try:
        return int(string)
    except exceptions.ValueError:
        return default
    except exceptions.TypeError:
        return default

@contextmanager
def redirect_print():
    """ Creates a StringIO that will receive everything written to 
        the standard output while it's alive.
    """
    buf = StringIO.StringIO()
    sys.stdout = buf
    yield buf
    sys.stdout = sys.__stdout__

def generate_salt(len):
    """Return a salt for the final hashed password"""
    salt = ''
    for i in range(len):
        salt += random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    return salt

def get_contact_permissions(shinken_contact):
    """ Return the list of hosts and services the current user is allowed to see. """

    services_permissions = livestatus.livestatus.services._query
    services_permissions = services_permissions.filter("contacts >= %s"%shinken_contact)
    services_permissions = services_permissions.columns('description')
    services_permissions = list(set([n['description'] for n in services_permissions.call()]))

    hosts_permissions = livestatus.livestatus.hosts._query
    hosts_permissions = hosts_permissions.filter("contacts >= %s"%shinken_contact)
    hosts_permissions = hosts_permissions.columns('name')
    hosts_permissions = [n['name'] for n in hosts_permissions.call()]

    hosts_with_services = livestatus.livestatus.hosts._query
    hosts_with_services = hosts_with_services.columns(*('services','name','contacts'))
    hosts_with_services = [h['name'] for h in hosts_with_services.call() if len([s for s in h['services'] if s in services_permissions]) and shinken_contact not in h['contacts']]

    hosts_permissions = hosts_permissions + hosts_with_services
    
    hostgroups_permissions = livestatus.livestatus.hostgroups._query
    hostgroups_permissions = hostgroups_permissions.columns(*('name','members'))
    hostgroups_permissions = [n['name'] for n in hostgroups_permissions.call() if len([m for m in n['members'] if m in hosts_permissions])]

    servicegroups_permissions = livestatus.livestatus.servicegroups._query
    servicegroups_permissions = servicegroups_permissions.columns(*('name','members'))
    servicegroups_permissions = [n['name'] for n in servicegroups_permissions.call() if len([m for m in n['members'] if m in services_permissions])]

    results = {'hosts': hosts_permissions , 'services': services_permissions, 'hostgroups': hostgroups_permissions, 'servicegroups': servicegroups_permissions, 'hosts_with_services': hosts_with_services}

    return results
