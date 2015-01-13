#!/usr/bin/env python
#
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

""" Helper script that can be used to run the unit tests suite. """ 

from unittest import TextTestRunner

from omeganoc_tests import get_all_tests

if __name__ == '__main__':
    TextTestRunner(verbosity=2).run(get_all_tests())
    raw_input('Press any key')
