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

from graphitequery import query
from datetime import datetime
import argparse

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('path')
  
  args = parser.parse_args()

  print 'Fetching path ' + args.path

  results = query.query(target=args.path, from_time='-31d')

  if len(results) == 0:
    print 'Not found'
  else:

    current = results[0].start

    for val in results[0].getInfo()['values']:
      current = current + results[0].step
      if val:
        print "%s %d"%(str(datetime.fromtimestamp(current)),val)

    print 'Starting: %s'% str(datetime.fromtimestamp(results[0].start))
    print 'Ending: ' + str(datetime.fromtimestamp(results[0].end))
    print 'Step: ' + str(results[0].step)
