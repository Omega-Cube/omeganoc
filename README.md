INSTALL
=======

Dependencies:
------------
* shinken >= 2.0
* sqlite3
* graphviz
* graphviz-devel
* python >= 2.6
* python-devel
* libxml2-devel

*For Debian/Ubuntu*

     apt-get install python-pip python-pycurl sqlite3 graphviz graphviz-dev pkg-config python-dev libxml2-dev
*For CentOS 7+*

     # install setup tools
     curl https://bitbucket.org/pypa/setuptools/raw/bootstrap/ez_setup.py | python -
     # install pip
     curl https://raw.github.com/pypa/pip/master/contrib/get-pip.py | python -
     easy_install pip

     yum install sqlite graphviz graphviz-devel gcc gcc-c++ python-devel libxml2-devel

STEP 0 : FETCH GIT SUBMODULES
-----------------------------

If you are installing or upgrading from the git repository you'll need to fetch external modules before running any commands.

   git submodules init
   git submodules update

STEP 1 : SHINKEN INSTALL
------------------------

Install and initialize shinken (requiere root privileges).

     useradd --user-group shinken
     cd <omeganoc>/<directory>
     make shinken-install
     shinken --init
Just run `make shinken-install` if shinken have already ben installed.

STEP 2 : INSTALL SHINKEN PLUGINS
--------------------------------

Run the install script with root privileges

    cd <omeganoc>/<directory>
    make install
Edit broker-master.cfg to add hokuto, graphite and livestatus modules

    #/etc/shinken/brokers/broker-master.cfg
    modules    graphite, livestatus, hokuto
Also if you have a lot of logs data set use_aggressive_sql to 1 from logstore-sqlite

     #/etc/shinken/modules/logstore_sqlite.cfg
     use_aggressive_sql      1   ; Set to 1 for large installations

STEP 3 : IMPORTING PREVIOUS DATA
--------------------------------

You can skip this step if it is your first install.
You'll need to initialize the sla database with existing archived logs

    make import-sla

STEP 4 : CONFIG
---------------

To change settings update /etc/shinken/modules/hokuto.cfg :
```
## Module:      Omega Noc
## Loaded by:   Broker
# The Omeganoc web interface and integrated web server
define module {
    module_name     hokuto
    module_type     hokuto
    host            0.0.0.0;                       The hostname to listen on. 0.0.0.0 to listen from any sources.
    port            5000;                          The port of the webserver.
    dbpath          /var/lib/shinken/hokuto.db;    The path the OmegaNoc's database file
    secretkey       Enter the secretest key here!; The server's secret key used for signing cookies
    logging         /var/log/shinken/hokuto.log;   Log file
    threaded        1  ;                           Set to 0 if you want to manage all requests on the same thread. Slower but may
                       ;                           improve stability in some cases
}
```
Don't forget to restart the service after any change:

      /etc/init.d/shinken restart

You can then access hokuto from http://<host>:<port>

STEP 5 : START OR RESTART DAEMONS
---------------------------------

Graphite requiere carbon daemon.

    python /opt/graphite/bin/carbon-cache.py start
Note: It can be helpfull to add an init script into your boot loader, forgetting to start carbon is a common mistake.

Shinken daemon also need to be (re)started.

    service shinken start|restart


STEP 6 : SET ADMIN USER PASSWORD
--------------------------------

At this stage you should be able to access omeganoc from http://<host>:<port> (see STEP 4).
Omeganoc default admin user is :

         username : admin
         password : admin

Don't forget to login and update this user with a more secured password.

ADDING NEW HOSTS, CONTACTS AND SERVICES
=======================================

An admin interface to manage hosts/services/contacts and probes is currently under development.

For now if you need to add or edit hosts, services, contacts and monitoring data see [shinken settings and configuration](https://shinken.readthedocs.org/en/latest/05_thebasics/index.html).

TROUBLESHOOTING
===============

*Shinken is (re)starting normaly but I can't reach the webserver

There have been some major change between shinken 2.0.x and shinken 2.2, if you have installed livestatus and shinken manually they may be incompatible (livestatus from shinken.io, which you get when you launch `shinken install livestatus`, don't work with the latest version of shinken).
* If you are using shinken < 2.2 install livestatus from sources

  cd </omeganoc/directory> && shinken install --local livestatus
* If you are using shinken 2.0.x install livestatus from shinken.io

  shinken install livestatus

*I can't see any host/probe

By default all users are created with the shinken contact 'None' which prevent the user to get information from any host.
Edit your profile with the proper shinken contact (or ask an admin for it).
Shinken contact are imported from shinken, for more information see [Shinken contact configuration](https://shinken.readthedocs.org/en/latest/08_configobjects/contact.html).

Another reason can be that carbon daemon is not running, carbon doesn't start on startup by default and need to be launch after each reboot.

*SLA tools don't return data prior to my installation*

Retrieve SLA informations from livestatus was very ressource consuming, so hokuto is using his own database to process such data.
To import all data from archived livestatus logs run

    make import-sla
From your installation directory.

*Dashboard's widget are very slow to loadup and if I try to reload data from one of theme I get an infinite spinner

Enable use_aggressive_sql from logstore-sqlite's configuration.

*I just installed shinken but exemple config seems not working (showing file not exist warnings)

Shinken is given with a prebuild config which monitor localhost (don't forget to give correct shinken contact to your user), anyway you'll need nagios-plugins to made theme work.
Don't forget to check if carbon is currently running.
Also hosts will not show up on host selection until they have some datas so you may need to wait few minutes.
