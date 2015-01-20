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

Shinken install

    useradd --user-group shinken
    pip install shinken
    shinken --init

INSTALL
------------

Run the install script with root privileges

    cd <omeganoc>/<directory>
    make install
Add hokuto, graphite and livestatus to the broker's module

    #/etc/shinken/brokers/broker-master.cfg
    modules    graphite, livestatus, hokuto
Launch or restart daemons

    python /opt/graphite/bin/carbon-cache.py start
    service shinken start|restart

UPGRADING
---------
If you are upgrading an existing project you'll need to initialize the sla database from archived logs

    make import-sla

Restart shinken daemon

    service shinken restart

CONFIG
======

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
                        ;                          improve stability in some cases
}
```
Don't forget to restart the service after any change:

      /etc/init.d/shinken restart

You can then access hokuto from http://<host>:<port>

About how to add/edit hosts, services, contacts and monitoring data see [shinken settings and configuration](https://shinken.readthedocs.org/en/latest/05_thebasics/index.html).

TROUBLESHOOTING
===============

*Shinken is (re)starting normaly but I can't reach the webserver

There have been some major change between shinken 2.0.x and shinken 2.2, if you have installed livestatus and shinken manually they may be incompatible (livestatus from shinken.io, which you get when you launch `shinken install livestatus`, don't work with the latest version of shinken).
* If you are using shinken < 2.2 install livestatus from sources

  cd </omeganoc/directory> && shinken install --local livestatus
* If you are using shinken 2.0.x install livestatus from shinken.io

  shinken install livestatus

*I can't see any host/probe*

By default all users are created with the shinken contact 'None' which prevent the user to get information from any host.
Edit your profile with the proper shinken contact (or ask an admin for it).
Shinken contact are imported from shinken, for more information see [Shinken contact configuration](https://shinken.readthedocs.org/en/latest/08_configobjects/contact.html).

Another reason can be that carbon daemon is not running, carbon doesn't start on startup by default and need to be launch after each reboot.

*SLA tools don't return data prior to hokuto installation*

Retrieve SLA informations from livestatus was very ressource consuming, so hokuto is using his own database to process such data.
To import all data from archived livestatus logs run

    make import-sla
From your installation directory.
