#!/usr/bin/env python
#
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
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
#
# This file is part of Omega Noc

""" System structure, metrologic and history data fetching with livestatus
"""
from collections import OrderedDict
from . import mk_livestatus
import time

FILTER_KEYS = {
    "hosts": "name",
    "services": "display_name",
    "hostgroups": "name",
    "servicegroups": "name",
    "contactgroups": "name",
    "servicesbygroup": None,
    "servicesbyhostgroup": None,
    "hostsbygroup": "name",
    "contacts": "name",
    "commands": "name",
    "timeperiods": "name",
    "downtimes": None,
    "comments": None,
    "log": None,
    "status": None,
    "columns": None,
    # "statehist": None,
}

DYNAMIC_ATTRIBUTES = {
    "hosts": OrderedDict([("services", "services:host_name"),
              ("contacts", "contacts"),
              ("contact_groups", "contactgroups"),
              ("parents", "hosts"),
              ("child_dependencies", "hosts:name"),
              ("childs", "hosts:name"),
              ]),
    #"services": (),
    # "hostgroups": (),
    # "servicegroups": (),
    # "contactgroups": (),
    # "servicesbygroup": (),
    # "servicesbyhostgroup": (),
    # "hostsbygroup": (),
    # "contacts": (),
    # "commands": (),
    # "timeperiods": (),
    # "downtimes": (),
    # "comments": (),
    # "log": (),
    # "status": (),
    # "columns": (),
    # "statehist": (),
}


# All livestatus supported keys/attributes
SUPPORTED = FILTER_KEYS.keys()

# All keys/attributes that can be filtered
FILTERABLES = [key for key in FILTER_KEYS if FILTER_KEYS[key] is not None]

# All filterables that should always return an array, even when the results contains
# only one or no results
LIST_FILTERABLES = ['services']

SERVER_ADDRESS=("127.0.0.1", 50000)

class Socket(mk_livestatus.Socket):
    " Cached version of mk_livestatus.Socket "
    def __init__(self, peer, cache=True):
        super(Socket, self).__init__(peer)
        self._cache = cache
        self._cache_call = {}

    def call(self, request, columns=None):
        " Cached version of mk_livestatus.Socket.call "
        if self._cache:
            if isinstance(columns, tuple):
                pass
            elif isinstance(columns, list):
                columns = tuple(columns)
            elif columns is None:
                pass
            else:
                raise Exception(
                    "The columns parameter should be a list or None")
            # TODO: We should be able to specify a TTL for each domain (hosts, services, logs... )
            if not (request, columns) in self._cache_call \
                    or self._cache_call[(request, columns)][1] < time.time():
                self._cache_call[(request, columns)] = [
                    self._call(request, columns),
                    time.time() + 30
                    ]
            # else:
            #     print "Cache hit:\n%s"%repr((request, columns))
            return self._cache_call[(request, columns)][0]
        #else:
        return self._call(request, columns)

    def _call(self, request, columns):
        result = super(Socket, self).call(request, columns)
        if len(result) > 0:
            # Check whether livestatus returned an error
            error_string = "Completely invalid GET request"
            first_result = result[0]
            if isinstance(first_result, dict):
                key = first_result.keys()[0]
                if error_string in key:
                    msg = "livestatus reported the following request"\
                          " as invalid:\n"
                    msg += request
                    raise Exception(msg)
        return result


def singular(name):
    # We just remove the ending "s" except for hostsbygroup
    if name == "hostsbygroup":
        return "hostbygroup"
    else:
        return name[:-1]

class BaseQuery(object):
    " Abstract base class for all query objects.\n\nDo not instantiate. "
    def __init__(self, parent, name, query):
        self._parent = parent
        self._name = name
        self._query = query

    def __getattr__(self, attr):
        return self._filter(attr)

    def __getitem__(self, item):
        return self._filter(item)

    def __repr__(self):
        name = self._name
        if " " in name:
            name = "[\"%s\"]"%name
        else:
            name = ".%s"%name
        parent = self._parent
        while parent:
            parent_name = parent._name
            if " " in parent_name:
                parent_name = "[\"%s\"]"%parent_name
            else:
                parent_name = ".%s"%parent_name
            name = "%s%s"%(parent_name, name)
            if hasattr(parent, "_parent"):
                parent = parent._parent
            else:
                break
        return name[1:]

class LiveStatus(BaseQuery):
    " Used only by the root livestatus object"

    def __init__(self, parent=None, name="livestatus",
                 query=Socket(SERVER_ADDRESS)):
        super(LiveStatus, self).__init__(parent, name, query)

    def _filter(self, attr):
        try:
            res = Query(self, attr, getattr(self._query, attr))
        except:
            raise AttributeError(attr)
        return res

    def raw(self):
        return SUPPORTED

    def set_server_address(self, server_address):
        """ server_address can be whatever python's socket library accepts

            Note that this method will destroy the cache (if any), because
            the cache is tied to the _query attribute
            (which is recreated by this method)
        """
        global SERVER_ADDRESS
        SERVER_ADDRESS = server_address
        self._query = Socket(SERVER_ADDRESS)

    def clear_cache(self):
        " clear/invalidate the cache "
        self._query._cache_call = {}

    def cache_whole_structure(self, clear=True):
        " load the complete structure into the cache "
        if clear:
            self.clear_cache()
        for key, value in FILTER_KEYS.iteritems():
            # list_ might be, for example, "hosts"
            list_ = getattr(self, key)
            for el in list_.raw():
                if value is not None:
                    # print list_._name
                    # print el['name']
                    # print getattr(list_, el[value])
                    s = getattr(list_, el[value])



class Query(BaseQuery):
    """ Used for livestatus queries that can return more than one element
        E.g. for all hosts (``livestatus.hosts``)
    """
    def __init__(self, parent, name, query):
        super(Query, self).__init__(parent, name, query)
        self._filter_key = FILTER_KEYS[self._name]

    def _filter(self, attr):
        # Empty the filter list
        if self._query._filters:
            self._query._filters = []
        if self._name in FILTERABLES:
            filter = "%s = %s"%(self._filter_key, attr)
            res = self._query.filter(filter)
            # if self._parent:
            res = res.call()
            element_name = singular(self._name)
            if self._name in LIST_FILTERABLES:
                return [Element(self, attr, item) for item in res]
            elif len(res) == 1:
                return Element(self, attr, res[0])
            elif len(res) == 0:
                return None
            else:
                return [Element(self, attr, item) for item in res]
        else:
            raise AttributeError(
                "%s is not filterable, you supplied the attribute %s"\
                %(self._name, attr))

    def raw(self):
        return self._query.call()

    def query(self):
        res = []
        _list = self._query.columns(self._filter_key).call()
        # Reset the _columns attribute
        self._query._columns = []
        for _item in _list:
            res.append(_item[self._filter_key])
        res.sort()
        return res

    def __iter__(self):
        result = self.query()
        for r in result:
            yield r

class Element(BaseQuery):
    """ Used for livestatus filtered queries that return exactly one element

        E.g. for a particular host: ``livestatus.hosts.blackmamba``
    """
    # def __init__(self, parent, name, query):
    #     super(Element, self).__init__(parent, name, query)

    def _get_dynamic_attribute(self, dynamic_attribute_name):
        """ Returns a particular dynamic attribute of a particular ``Element``.

        Dynamic attributes are defined in ``DYNAMIC_ATTRIBUTES``,
        e.g. dynamic attributes of a host (for the key "hosts")
        would be "services", "contacts", etc.

        Originally, when fetched from livestatus, these attributes
        contain a comma-separated list of names (strings) of all subelements.
        For example,
        a host named "blackmamba" might have an attribute "services"
        containing the string
        "Memory,MySQL status,[Disk] Versatile,PING,LOAD,DISK-ROOT"

        When specified as a dynamic attribute, this "services" attribute
        will be converted to a "dynamic" attribute,i.e. it
        will be a Python ``list`` of *actual* ``Element`` instances.

        Also, when there is a many-to-many dependency between the element
        and the dynamic attribute, the "foreign key" in the dependant
        dynamic attribute
        must be specified after a colon (:), e.g. for the element "hosts"
        there is a "services" dynamic attribute.  However, because the "global"
        "services" element (the one that contains all of the services defined
        in shinken, and returned by livestatus) contains services with
        the same name (e.g. "Memory"), but for different hosts,
        we have to define
        the dynamic attribute with "services:host_name". This
        will allow matching the host's "name" attribute
        (which is defined in FILTER_KEYS and uniquely specifies a particular
        host) against the service's "host_name" attribute.
        """
        dynamic_attributes = DYNAMIC_ATTRIBUTES[self._parent._name]
        if dynamic_attribute_name in dynamic_attributes:
            real_dynamic_attribute_name = dynamic_attributes[dynamic_attribute_name]
            # Please see the docstring of this function for an explanation of
            # the usage of the colon (:)
            if ":" in real_dynamic_attribute_name:
                real_dynamic_attribute_name, parent_parameter =\
                    real_dynamic_attribute_name.split(":")
            else:
                parent_parameter = None
            # members are separated with commas in livestatus
            # i.e. "contacts": "user,admin"
            dynamic_attribute_member_names =\
                [_member.strip() for
                 _member in self._query[dynamic_attribute_name]]
            # Now we fetch the actual instances
            dynamic_attribute_members = []
            for _name in dynamic_attribute_member_names:
                # First find all subelements that match the ``_name`` parameter
                # e.g. find all services named "Memory"
                member = getattr(livestatus, real_dynamic_attribute_name)._query
                member._filters = []
                filter = '%s = %s'%(FILTER_KEYS[real_dynamic_attribute_name], _name)
                member.filter(filter)
                # Now look whether the subelement must be matched against some parent's
                # attribute, e.g. there could be several services named "Memory"
                # on different hosts.
                # Find the one that matches our particular host (by "host_name")
                if parent_parameter is not None:
                    filter = '%s = %s'%(parent_parameter,
                                   self.raw()[FILTER_KEYS[self._parent._name]])
                    member = member.filter(filter)
                _list = member.call()
                if len(_list) != 1:
                    message = "There can be only one element that matches "\
                        "the query:\n%s"%str(member)
                    raise Exception(message)
                member = _list[0]
                member = Element(getattr(livestatus, real_dynamic_attribute_name),
                                 _name, member)
                dynamic_attribute_members.append(member)
            return dynamic_attribute_members
        else: # No dynamic_attribute with the supplied name
            return None

    def _filter(self, attr):
        # The first dynamic_attribute in DYNAMIC_ATTRIBUTES is the "fallback"
        # dynamic_attribute
        # to be used for filtering.  For example, for a particular host
        # blackmamba if the user queries ``blackmamba.Memory``,
        # its attribute blackmamba.services (first dynamic attribute) will
        # be used first to see whether there is a service named "Memory",
        # and return that.
        if DYNAMIC_ATTRIBUTES.has_key(self._parent._name):
            dynamic_attribute_name = DYNAMIC_ATTRIBUTES[
                                        self._parent._name].items()[0]
            dynamic_attribute_name,\
                real_dynamic_attribute_name = dynamic_attribute_name
            # parent_parameter is not needed
            if ":" in real_dynamic_attribute_name:
                real_dynamic_attribute_name, parent_parameter =\
                    real_dynamic_attribute_name.split(":")
            dynamic_attribute_members =\
                self._get_dynamic_attribute(dynamic_attribute_name)
            for member in dynamic_attribute_members:
                if getattr(member, FILTER_KEYS[real_dynamic_attribute_name]) == attr:
                    return member
            if attr == "*":
                return dynamic_attribute_members
            # A member named attr was not found
            elif self._get_dynamic_attribute(attr):
                return self._get_dynamic_attribute(attr)
        # This Element doesn't have dynamic_attributes or we didn't find
        # a match, so... return the value from the _query dict
        return self._query[attr]

    def raw(self):
        return self._query

def get_systemstructure_data(target):
    """ A wrapper function around the ``livestatus`` object

        It's only parameter ``target`` is a dot (.) separated path string of
        the form 'hostname.servicename', where hostname and servicename can
        also be wildcards (*).

        Its return value depends on the ``target`` parameter:
         - "*.*": return a list of all services on all hosts "*.*"
         - "*.servicename": return a list of all services with
           a particular name on all hosts
         - "hostname.*": return a list of all services on a particular host
         - "hostname.servicename": return a particular service
           on a particular host

    """
    attributes = target.split(".")
    if attributes[0] == "*":
        if attributes[1] == "*":
            # All services on all hosts "*.*"
            return [Element(livestatus, 'services', item)
                    for item in livestatus.services.raw()]
        else:
            # All services with a particular name on all hosts
            return livestatus.services[attributes[1]]
    # else:
    parent = livestatus.hosts
    for attr in attributes:
        parent = getattr(parent, attr)
    return parent

def get_status_logs(target, time_from=None, time_to=None, class_=None):
    """ Returns a ``list`` of ``dict``s, each ``dict`` containing
    a row of data returned by LiveStatus

    Parameters:
     * `target` is a string describing one or several objects to return
       data for. These objects can be hosts or services, and the string can
       specify one or several of them. The string contains two identifiers
       separated by a dot (.) character. The first one is an existing host
       name, the second one is an existing service name.
       Both service and host names can be replaced by a wildstar character (*).
       So to recap, here are all the possible combinations :
        - localhost.Cpu : Get the history for the Cpu service on the localhost
          host
        - localhost.* : Get the history for all the services on the localhost
          host
        - *.Cpu : Get the history for all the Cpu services, on all the hosts
        - *.* : Get all the logs for all the elements
     * `time_from` is the minimum timestamp for the returned entries
     * `time_to` is the minimum timestamp for the returned entries
     * `class_`: An optional array of numeric log class identifiers.
       If specified, only messages of this class will be included in the
       results (see the LiveStatus documentation for a list of
       possible classes).
    """
    log = livestatus.log._query
    log._filters = []
    host, service = target.split(".")
    if host != "*":
        log = log.filter('host_name = %s'%host)
    if service != "*":
        log = log.filter('service_description = %s'%service)
    if time_from is not None:
        log = log.filter("time >= %s"%time_from)
    if time_to is not None:
        log = log.filter("time <= %s"%time_to)

    if class_ is None:
        return log.call()
    elif isinstance(class_, int):
        log = log.filter("class = %s"%class_)
        return log.call()
    elif class_ and isinstance(class_, list):
        res = []
        for cls in class_:
            res.extend(log.filter("class = %s"%cls).call())
        return res

def get_all_hosts():
    return {h['name']: h for h in livestatus.hosts._query.call()}

def get_all_services():
    flat_list = livestatus.services._query.call()
    result = {}
    for s in flat_list:
        sname = s['description']
        if sname not in result:
            result[sname] = {}
        result[sname][s['host_name']] = s
    return result


livestatus = LiveStatus()
