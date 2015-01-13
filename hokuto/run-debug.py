#!/usr/bin/env python
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
#
# This file is part of Omega Noc

""" Helper script that can be used to launch the website during the development process """ 

import module.web

# There's a bug in Werkzeug that make it deadlock when a browser
# makes 2 requests at the same time (IE does that for example)
# Use threaded=True to avoid that bug
# Use threaded=False (default) for a better debugging experience
module.web.init(None)
module.web.app.run(host='0.0.0.0', debug=True, threaded=True)
