#!/usr/bin/env bash

export DEBIAN_FRONTEND=noninteractive
export PERL_MM_USE_DEFAULT=true

aptitude -q update
aptitude -y -q full-upgrade
aptitude -y -q install vim python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev

# Configure snmpd
cp /vagrant/vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
service snmpd restart

# Configure PERL for the SNMP probes
cpan install Net::SNMP

useradd --user-group shinken
useradd --user-group graphite
pip install pycurl cherrypy
cd /vagrant
make shinken-install

# Initialize Shinken
shinken --init
shinken install linux-snmp

# Fix a missing file in linux-snmp
cp /vagrant/vagrant_provision/utils.pm.template /var/lib/shinken/libexec/utils.pm

# Configure Shinken
cp /vagrant/vagrant_provision/broker-master.cfg.template /etc/shinken/brokers/broker-master.cfg
cp /vagrant/vagrant_provision/localhost.cfg.template /etc/shinken/hosts/localhost.cfg
cp /vagrant/vagrant_provision/livestatus.cfg.template /etc/shinken/modules/livestatus.cfg

# Launch the installer
# We do not use the "install" target as it will  install the on-reader lib by copying the files
# Instead we'll create links to directly manipulate the files during development
make install

# Auto start the carbon daemon on launch
cp /vagrant/vagrant_provision/carbon.init.template /etc/init.d/carbon
chmod 755 /etc/init.d/carbon
update-rc.d carbon defaults

# with symbolic links hokuto and on_reader are not readable from shinken services which prevent shinken from loading hokuto.

# Make the lib folder available globally for the shinken and vagrant users
#mkdir -p /home/shinken/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/shinken/.local/lib/python2.7/site-packages/on_reader
#chown -R shinken:shinken /home/shinken

#mkdir -p /home/vagrant/.local/lib/python2.7/site-packages
#ln -s /vagrant/lib/on_reader/on_reader /home/vagrant/.local/lib/python2.7/site-packages/on_reader
#chown -R vagrant:vagrant /home/vagrant/.local

# Create links so that the shinken module is in the right place
#ln -s /vagrant/hokuto/module /var/lib/shinken/modules/hokuto
#ln -s /vagrant/hokuto/etc/modules/hokuto.cfg /etc/shinken/modules/hokuto.cfg

#
# Start things up
/etc/init.d/carbon start
service shinken restart
