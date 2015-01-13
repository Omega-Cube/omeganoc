#!/usr/bin/env python
# -*- coding: utf-8 -*-
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

import ast
import socket


__all__ = ['Query', 'Socket']


class Query(object):
    def __init__(self, conn, resource):
        self._conn = conn
        self._resource = resource
        self._columns = []
        self._filters = []

    def call(self):
        if self._columns:
            return self._conn.call(str(self), self._columns)
        return self._conn.call(str(self))

    def __str__(self):
        request = 'GET %s' % (self._resource)
        if self._columns and any(self._columns):
            request += '\nColumns: %s' % (' '.join(self._columns))
        if self._filters:
            for filter_line in self._filters:
                if filter_line.startswith('Or') or filter_line.startswith('And') or filter_line.startswith('Stats'):
                    request += '\n%s' % (filter_line)
                else:
                    request += '\nFilter: %s' % (filter_line)


        request += '\nColumnHeaders: on'
        request += '\nOutputFormat: python'

        # # Change the default CSV column separator to ASCII 30 RS (Record separator)
        # request += '\nSeparators: 10 30 44 124'

        # ResponseHeader is used for error codes
        request += '\nResponseHeader: fixed16'
        return request + '\n\n'

    def columns(self, *args):
        self._columns = args
        return self

    def filter(self, filter_str):
        self._filters.append(filter_str)
        return self

class Socket(object):
    def __init__(self, peer):
        self.peer = peer

    def __getattr__(self, name):
        return Query(self, name)

    def call(self, request, columns=None):
        try:
            if len(self.peer) == 2:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            else:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.connect(self.peer)
            s.send(request)
            s.shutdown(socket.SHUT_WR)

            text = s.makefile().read()
            status = text[:3]
            length = int(text[4:15].strip())
            # if status == '400':
            #     msg = "The request contains an invalid header."
            # elif status == '403':
            #     msg = "The user is not authorized (AuthHeader)"
            # elif status == '404':
            #     msg = "The target of the GET has not been found"
            # elif status == '450':
            #     msg = "A non-existing column was being referred to"
            # elif status == '451':
            #     msg = "The request is incomplete."
            # elif status == '452':
            #     msg = "The request is completely invalid."
            # Check for status 200, otherwise throw an unknown status error
            # elif status == '200':
            #     pass
            # else:
            #     msg = "Completely uknown status code %s."%status

            response = text[16:]
            if status != '200':
                msg = "\nThe request returned an error with " \
                      "a status code %s and the following message:\n" \
                      "\n%s"%(status, response)
                msg += '\nThe request was as follows:\n\n' + request
                raise Exception(msg)
            # else status == '200':
            _res = ast.literal_eval(response)
            # The first row is just attribute_names
            attribute_names = _res.pop(0)
            res = []
            for item in _res:
                attributes = {}
                for i, value in enumerate(item):
                    key = attribute_names[i]
                    attributes[key] = value
                res.append(attributes)
            return res
        finally:
            s.close()
