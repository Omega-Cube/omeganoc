#!/usr/bin/env bash

export DEBIAN_FRONTEND=noninteractive
export PERL_MM_USE_DEFAULT=true

aptitude -q update
aptitude -y -q full-upgrade
aptitude -y -q install vim git python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev

# Configure snmpd
cp /vagrant/vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
service snmpd restart

# Configure PERL for the SNMP probes
cpan install Net::SNMP

useradd --user-group shinken
useradd --user-group graphite
pip install pycurl cherrypy
cd /vagrant
git submodule init
git submodule update
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
# We do not use the "install" target because we we to create symlinks to the development files
# instead of copies to facilitate development.
make graphite shinken on-reader clean

# Create symbolic links for Hokuto and Nanto daemons
ln -s /vagrant/hokuto/standalone /usr/local/hokuto
ln -s /vagrant/nanto /usr/local/nanto
# Same for their startup scripts
ln -s /vagrant/hokuto/etc/init.d/hokuto /etc/init.d/hokuto
ln -s /vagrant/nanto/etc/init.d/nanto /etc/init.d/nanto
update-rc.d hokuto defaults
update-rc.d nanto defaults

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

#
# Start things up
/etc/init.d/carbon start
service shinken restart
service nanto start
service hokuto start
