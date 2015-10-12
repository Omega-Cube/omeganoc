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

SHELL = /bin/sh
WHOAMI = $(shell whoami)

#clear out the suffix list
.SUFFIXES:
.IGNORE: check-dependencies graphite-prebuild shinken-prebuild

#prevent up-to-date return
.PHONY: mock help default install clean test

default: help

help:
	@echo "Commands\n"
	@egrep -o "(^[a-z]+):" ./GNUmakefile

sudoer:
	@if [ $(WHOAMI) != root ]; then \
		echo "Please run this script as root or with sudo"; \
		exit 1; \
	fi

install: dependencies sudoer graphite shinken on-reader hokuto clean

dependencies: shinken-dependencies graphite-dependencies

check-dependencies:
	@echo "Checking global dependencies..."
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken, please run 'make shinken-install'"; exit 1;}
	@command -v R 2>&1 || { echo >&2 "Missing R"; exit 1;}
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

clean: on-reader-clean

#tools
import-sla: sudoer
	@sqlite3 /var/lib/shinken/hokuto.db "CREATE TABLE IF NOT EXISTS sla (id INTEGER NOT NULL, host_name VARCHAR(128) NOT NULL, service_description VARCHAR(32), time INTEGER NOT NULL, state INTEGER, PRIMARY KEY (id));"
	@python hokuto/module/import_sla.py


#graphite
graphite-dependencies:
	@command -v pip 2>&1 || { echo >&2 "Missing pip."; exit 1;}

graphite: graphite-prebuild graphite-dependencies sudoer
	pip install 'graphite-query==0.11.3'

#shinken
shinken-dependencies:
	# Checks that Shinken is installed
	@command -v python 2>&1 || { echo >&2 "Missing python"; exit 1;}
	@command -v shinken 2>&1 || { echo >&2 "Missing shinken"; exit 1;}

shinken-install-dependencies: sudoer
	@echo -n "\033]0;Installing shinken plugins dependencies\007"
	pip install 'pycurl==7.19.0' 'flask==0.10.1' 'flask-login==0.2.11' 'flask-sqlalchemy==2.0' 'flask-babel==0.9' 'python-igraph==0.7' wtforms 'flask-assets==0.10' 'whisper==0.9.13' carbon 'Twisted<12.0' 'networkx==1.10rc2' 'graphviz==0.4.5' 'pygraphviz==1.3rc2' 'graphite-query==0.11.3' 'python-mk-livestatus==0.4' 'gunicorn==19.3.0'

shinken-install-plugins: sudoer vendors
	-useradd --user-group graphite
	@echo -n "\033]0;Installing shinken - livestatus plugin\007"
	shinken install --local vendor/livestatus
	@echo -n "\033]0;Installing shinken - graphite plugin\007"
	shinken install graphite
	@echo -n "\033]0;Installing shinken - logstore-sqlite plugin\007"
	shinken install --local vendor/logstore-sqlite
	@echo -n "\033]0;Installing shinken - hokuto plugin\007"
	shinken install --local hokuto

shinken-plugins-config: sudoer
	@echo -n "\033]0;Initialize livestatus config files\007"
	@if ! ls /opt/graphite/conf/carbon.conf >/dev/null 2>&1; then\
		cp /opt/graphite/conf/carbon.conf.example /opt/graphite/conf/carbon.conf; \
	fi
	@if ! ls /opt/graphite/conf/storage-schemas.conf >/dev/null 2>&1; then\
		cp /opt/graphite/conf/storage-schemas.conf.example /opt/graphite/conf/storage-schemas.conf; \
	fi

shinken: shinken-prebuild shinken-install-dependencies shinken-install-plugins shinken-plugins-config
	@echo Omeganoc have been succefully installed
	@echo Add "'modules graphite, livestatus, hokuto'" to your broker-master.cfg file
	@echo Add modules logstore-sqlite to livestatus.cfg.

# Hokuto - Copy hokuto files to their install directory
hokuto: sudoer
	@echo Installing Hokuto
	cp hokuto/standalone /usr/local/hokuto
	cp hokuto/etc/hokuto.cfg /etc/hokuto.cfg

#install shinken from sources
vendors:
	@if ! ls vendor/shinken >/dev/null 2>&1; then echo "Missing vendors file, please run 'git submodules update'" & exit 1; fi

shinken-install: vendors sudoer
	@cd vendor/shinken && python setup.py install clean

#libs
on-reader: sudoer
	@echo -n "\033]0;Installing livestatus libraries.\007"
	@cd lib/on_reader && python setup.py install

on-reader-clean: sudoer
	@cd lib/on_reader && python setup.py clean
	@rm -rf lib/on_reader/build

#prebuilds messages
graphite-prebuild:
	@echo -n "\033]0;Installing graphite python API/\007"
shinken-prebuild:
	@echo -n "\033]0;Configuring shinken\007"

#TODO
# python-igraph
