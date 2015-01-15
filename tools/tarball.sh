#!/bin/sh
#
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
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
# Build a new tarball with minified ressources.

VERSION="v0.01"
BUILDNAME="omeganoc_"$VERSION

echo Building $BUILDNAME archive...;

#create the archive
echo Copying files to the temporary directory
mkdir $BUILDNAME
rsync -av --exclude='tools' --exclude='mock' ../* $BUILDNAME/

#uglify
echo Uglify static files
r.js -o build.js dir=$BUILDNAME/hokuto/module/web/static

# build the tarball
echo Compress the archive
tar -czvf $BUILDNAME.tar.gz $BUILDNAME --exclude=\.* --exclude=*.pyc --exclude=*.log --exclude=*.db --exclude=*~ --exclude=#* --exclude=Vagrantfile \
    --exclude=vagrant_provision --exclude=mock --exclude=tools --exclude=omeganoc.tar.gz --exclude=lib/on_reader/build;
mv $BUILDNAME.tar.gz ../;
echo Removing temp directory
rm -Rf $BUILDNAME;
