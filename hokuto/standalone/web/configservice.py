#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2015 Omega Cube and contributors
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

""" Contains pages and web services used to manipulate shinken configuration files """

import copy
import os
import os.path
import re
import shutil
from subprocess import call, Popen

import pynag.Model
from pynag.Parsers import config
from flask import jsonify, render_template, abort, request, redirect
from flask.ext.login import login_required, current_user
from wtforms import Form, TextField, SelectField, SelectMultipleField, TextAreaField, SelectFieldBase, validators
from wtforms.fields.html5 import IntegerField, URLField
from werkzeug.contrib.cache import SimpleCache
from shinken.property import none_object
import shinken.objects
from shinken.objects.config import Config
from shinken.property import BoolProp, PythonizeError
import chardet

from . import app, cache, db
from user import User
from sqlalchemy import Table, select, exists, or_


_typekeys = {
    'host': 'host_name',
    'service': 'service_description',
    'hostgroup': 'hostgroup_name',
    'servicegroup': 'servicegroup_name',
    'contact': 'contact_name',
    'contactgroup': 'contactgroup_name',
    'timeperiod': 'timeperiod_name',
    'command': 'command_name',
    'hostdependency': 'host_name',
    'hostescalation': 'host_name',
    'servicedependency': 'service_description',
    'serviceescalation': 'service_description',
    'notificationway': 'notificationway_name',
    'realm': 'realm_name',
    'arbiter': 'arbiter_name',
    'scheduler': 'scheduler_name',
    'poller': 'poller_name',
    'reactionner': 'reactionner_name',
    'broker': 'broker_name'
}

CACHE_TIMEOUT = 60
LOCK_FILE = '/tmp/hokuto_shinken_conf.lock'

CONF_DIR = '/etc/shinken/'
TMP_DIR = '/tmp/shinken/'
WAIT_DIR = '/tmp/waiting/'
WAIT_CONF_DIR = WAIT_DIR + 'shinken/'
CONF_FILE = 'shinken.cfg'
MIGRATE_FILE = 'migrate.txt'
SERVICE_WARNING_FILE = '/tmp/service_changed.txt'
LAST_CHECK = '/tmp/hokuto_shinken_test_results'
SIGNAL = '/tmp/shinken_update.signal'

# Tell pynag's Model to go fetch the fake configuration path
pynag.Model.cfg_file = os.path.join(TMP_DIR, CONF_FILE)

#################################### FUNCTIONS ##########################################
def _check_lock():
    ''' Check if the configuration is currently locked and if the user is the current owner '''
    #TODO: retrieve owner and check if current owner != locked owner
    if(os.path.isfile(LOCK_FILE)):
        lockfile = open(LOCK_FILE,'r')
        lockerid = lockfile.read()
        lockfile.close()
        if(lockerid != str(current_user.id)):
            return False
    return True

def is_lock_owner():
    ''' Return 1 if conf is currently locked and current_user is the owner, return -1 if conf is  locked and there is error in configuration '''
    if(os.path.isfile(LOCK_FILE) and _check_lock()):
        if(_checkConf()):
            return 1
        else:
            return -1
    return False

def _set_lock():
    ''' Set the lock '''
    if(not _check_lock()):
        return False
    if(os.path.isfile(LOCK_FILE)):
        return True
    user = current_user.id
    lockfile = open(LOCK_FILE,'w+')
    lockfile.write(str(user))
    lockfile.close()
    return True

def _get_owner_name():
    """ Return current lock's owner id """
    username = False
    if(os.path.isfile(LOCK_FILE)):
        with open(LOCK_FILE,'r') as lockfile:
            userid = int(lockfile.read())
        user = User.query.get(userid)
        username = user.username
    return username

def _release_lock():
    ''' Release the current lock '''
    if(_check_lock() and os.path.isfile(LOCK_FILE)):
        os.remove(LOCK_FILE)
        return True
    return False

def _getconf():
    """ Return the conf from /tmp """
    conf = cache.get('nag_conf')
    if conf is None:
        # No conf in cache; load it
        if not os.path.exists(TMP_DIR):
            if os.path.exists(WAIT_CONF_DIR):
                src = WAIT_CONF_DIR
            else:
                src = CONF_DIR
            p = Popen(['cp','-R','--preserve=timestamps',src,TMP_DIR])
            p.wait()

        shinken_file = os.path.join(TMP_DIR, CONF_FILE)
        app.logger.debug('PyNag is loading configuration at: ' + shinken_file)
        conf = config(shinken_file) # Let pynag find out the configuration path by itself
        conf.parse()

        # TODO : Improve error handling
        # We remove the errors from the configuration as the error type
        # (ParserError) cannot be deserialized by the cache system
        for e in conf.errors:
            app.logger.warning('PyNag error: ' + str(e))
        conf.errors = []

        cache.set('nag_conf', conf, timeout=CACHE_TIMEOUT) #TODO : Configure cache timeout
    return conf

def _checkConf():
    """ Check shinken configuration and write check results to LAST_CHECK """
    conf_root = os.path.join(TMP_DIR, CONF_FILE)
    with open(LAST_CHECK,'w+') as checkfile:
        check = call(['shinken-arbiter','--verify','-c',conf_root], stdout=checkfile)
    return True if not check else False

def _parsetype(type):
    """
    Checks if the specified type name is a template, and returns the actual
    nagios/shinken data type and a boolean telling if it was a template.

    For example if you pass 'hosttemplate' you'll get ('host', True)
    But if you pass 'host' you'll get ('host', False)
    """
    istemplate = False
    if type.endswith('s'):
        type = type[:-1] # Remove the trailing 's'
    if type.endswith('template'):
        istemplate = True
        type = type[:-8] # Remove the trailing 'template'
    return (type, istemplate)

def _normalizestrings(data):
    """
    Recursively checks all the strings in the provided dict to make sure they only contain valid utf-8 characters.
    We do this to avoid errors during serialisation and transmission of the data with JSON.
    """
    if isinstance(data, str):
        # Non unicode strings : turn to unicode, secure invalid chars
        encode = chardet.detect(data)['encoding'];
        if not encode:
            encode = 'ascii'
        return data.decode(str(encode))
    elif isinstance(data, unicode):
        # Already unicode strings : return as-is
        return data
    elif isinstance(data, list):
        # Lists : check each element
        for val in xrange(0, len(data)):
            data[val] = _normalizestrings(data[val])
        return data
    elif isinstance(data, dict):
        # Dicts : Check each element
        for k, v in data.iteritems():
            data[k] = _normalizestrings(v)
        return data
    else:
        #Everything else : return as-is
        return data

def _get_details(objtype, istemplate, objid, formtype, targetfinder = None):
    #if no objid given we are creating a new configuration file
    if objid is None:
        setattr(formtype,'filename',TextField('Configuration file name',description='Will be saved in ' + str(_get_conf_dir(objtype))))
        form = formtype(request.form)
        #_annotateform(form, target)
        if request.method == 'POST':
            if not _check_lock():
                abort(403)
            if form.validate():
                # Save !
                _set_lock()
                _save_new(form, objtype)
                return redirect('/config#'+objtype)
            else:
                return render_template('config/details-{0}.html'.format(objtype), type=objtype, form=form, data={}, is_locked= not _check_lock(), owner_name = _get_owner_name())

        else: #GET
            return render_template('config/details-{0}.html'.format(objtype), type=objtype, form=form, data={}, is_locked= not _check_lock(), owner_name = _get_owner_name())
    else:
        conf = _getconf()
        if not targetfinder:
            typekey = 'all_' + objtype
            if typekey not in conf.data:
                return 'ELEMENT TYPE NOT FOUND',404 # No element of this type
            if istemplate:
                primkey = 'name'
            else:
                primkey = _typekeys[objtype]
            target = next((e for e in conf.data[typekey] if primkey in e and e[primkey] == objid), None)
        else:
            target = targetfinder(conf, istemplate)
        if target is None:
            return 'NO TARGET', 404

        _addtimeperiodsfield(formtype, target)
        form = formtype(request.form)
        _annotateform(form, target)
        if request.method == 'POST':
            if not _check_lock():
                abort(403)
            _set_lock()

            if _validatefullform(form,target):
                # Save !
                _set_lock()
                _save_existing(conf, target, form, False)
                return redirect('/config#'+objtype)
        else: #GET
            # Fill the form with the data from the configuration file
            _fillform(form, target)
        return render_template('config/details-{0}.html'.format(objtype),
                               type=objtype,
                               id=objid,
                               data=_normalizestrings(target),
                               form=form,
                               is_locked= not _check_lock(),
                               is_ready = _checkConf(),
                               owner_name = _get_owner_name())

def _searchservice(conf, istemplate, objid, containers):
    ihost = -1
    ihostgroup = -1
    try:
        ihost = containers.index('$')
    except ValueError:
        pass
    try:
        ihostgroup = containers.index('+')
    except ValueError:
        pass

    service_key = 'service_description'
    if istemplate:
        service_key = 'name'

    host = None
    hostgroup = None
    if ihost >= 0:
        if ihostgroup >= 0:
            if ihost > ihostgroup:
                hostgroup = containers[ihostgroup+1:ihost-1]
                host = containers[ihost+1:]
            else:
                host = containers[ihost+1:ihostgroup-1]
                hostgroup = containers[ihostgroup+1:]
            target = next((e for e in conf.data['all_service'] if service_key in e and e[service_key] == objid and
                                                            'host_name' in e and e['host_name'] == host and
                                                            'hostgroup_name' in e and e['hostgroup_name'] == hostgroup), None)

        else:
            host = containers[ihost+1:]
            target = next((e for e in conf.data['all_service'] if service_key in e and e[service_key] == objid and
                                                            'host_name' in e and e['host_name'] == host), None)
    else:
        if ihostgroup >= 0:
            hostgroup = containers[ihostgroup+1:]
            target = next((e for e in conf.data['all_service'] if service_key in e and e[service_key] == objid and
                                                            'hostgroup_name' in e and e['hostgroup_name'] == hostgroup), None)
        else:
            target = next((e for e in conf.data['all_service'] if service_key in e and e[service_key] == objid), None)
    if target is None:
        abort(404)
    return target

def _get_conf_dir(objtype):
    """ return the absolute path to the configuration directory of the given object type"""
    conf = _getconf()
    confdirs = {c:conf.abspath(c) for c in config.get_cfg_dirs(_getconf())}
    return next((confdirs[d] for d in confdirs if objtype == d or objtype + 's' == d), None)

def _save_new(form,targettype):
    """ Create a new conf file """
    # Extract filled fields from the form
    fdata = {k.name:k.data for k in form}
    filename = fdata['filename']
    if filename[-4:] != '.cfg':
        filename = filename + '.cfg'

    savedir = _get_conf_dir(targettype)

    targettype = targettype.capitalize()
    conftype = getattr(pynag.Model,targettype,False)

    if conftype:
        new_conf = conftype()
    else:
        f = open(savedir + '/' + filename,'w')
        f.write("# Configuration file " + savedir + '/' + filename + "\n")
        f.write("define "+targettype.lower()+" {\n")

    # Turn arrays into strings ['a','b','c'] => 'a,b,c'
    for k, v in fdata.iteritems():
        if k == 'filename':
            next
        if not v:
            next
        if isinstance(v, list):
            v = [v for v in v if v]
            fdata[k] = ','.join(v)

        if conftype:
            setattr(new_conf,k,v)
        elif v and k != 'filename':
            f.write("\t" + k + "\t" + str(v) + "\n")

    #app.logger.error('Commiting !! ' + savedir + '/' + filename)
    if conftype:
        new_conf.set_filename(savedir + '/' + filename)
        new_conf.save()
    else:
        f.write("}\n")
        os.chmod(savedir + '/' + filename,0o644)
        f.close()

    #delete conf cache
    cache.delete('nag_conf')
    return True


def _save_existing(conf, data, form, form_is_comprehensive):
    """
    Saves an existing item data

    *conf* is the root configuration object that the modified object has been extracted from
    *data* is the object that should be modified, extracted from *config*
    *form* is the form instance containing the changes that should be applied to *data*
    *form_is_comprehensive* determines if the form contains ALL of the possible directives of the target data object.
      If True, any directive in the original data that is not in the form will be removed. If false, only directives
      present in the form with an empty value will be removed.
    """
    # Extract filled fields from the form
    fdata = {k.name:k.data for k in form}
    did_change = False
    changed_id = (False,False,False)

    # Turn arrays into strings ['a','b','c'] => 'a,b,c'
    for k, v in fdata.iteritems():
        if isinstance(v, list):
            #trololololo, more seriously, this is to prevent empty values in list
            v = [v for v in v if v]
            fdata[k] = ','.join(v)

    attr = data['meta']['defined_attributes']
    for i in attr:
        if i not in fdata:
            # If the form is NOT comprehensive, do not remove a key that is not in the form
            if form_is_comprehensive:
                # Remove
                data[i] = None
                did_change = True
        elif not fdata[i]:
            data[i] = None
            did_change = True

        elif _normalizestrings(fdata[i]) != _normalizestrings(attr[i]):
            # Edit
            if(i == 'host_name' or i == 'service_description'):
               if(i == 'host_name'):
                  changed_id = ('host','/opt/graphite/storage/whisper/',fdata[i],attr[i])
               elif(i == 'service_description'):
                   #Set the description warning flag on
                   _set_service_change(attr[i],fdata[i])

            currentval = _normalizestrings(fdata[i])
            data[i] = currentval
            did_change = True

    for k, v in fdata.iteritems():
        if v is not None and v != '' and v != [] and k not in attr:
            # Create
            data[k] = str(v)
            # If we don't remove the field name from the data's template fields, it won't be saved by pynag
            if k in data['meta']['template_fields']:
                del data['meta']['template_fields'][data['meta']['template_fields'].index(k)]
            did_change = True

    if did_change:
        data['meta']['needs_commit'] = True

        #apply descriptions as comments
        for d in data['meta']['descriptions']:
            if data[d]:
                data[d] = data[d] + "\t; " + data['meta']['descriptions'][d]

        conf.commit()
        if changed_id[0]:
            _populate_migration_list(*changed_id)
        #delete conf cache
        cache.delete('nag_conf')

    return did_change

def _set_service_change(old,new):
    """ Set the service flag on """
    flag = open(SERVICE_WARNING_FILE,'w+')
    flag.write(str(old) + '|' + str(new))
    flag.close()

def _populate_migration_list(objtype,path,new,old):
    """ Add a new entry to the migration list, every host or service in it are marked for migrating their data after an identifer change """
    with open(TMP_DIR + MIGRATE_FILE,'a+') as f:
        f.write(objtype + '|' + path + '|' + old + '|' + new + "\n")

def _migrate_data():
    """ Migrate host or service data when updating their identifer name"""
    if not os.path.isfile(WAIT_CONF_DIR + MIGRATE_FILE):
        return
    with open(WAIT_CONF_DIR + MIGRATE_FILE,'r') as f:
        for line in f:
            migrate = line.rstrip().split('|')
            objtype = migrate[0]
            old = migrate[2]
            new = migrate[3]
            app.logger.info('Need to migrate ' + objtype + ' : ' + old + ' to ' + new)
            #Update any reference in the dashboard, sla and graph databases
            from dashboard import partsConfTable
            from sla import Sla
            from grapher import graphTokenTable
            for row in db.engine.execute(select([partsConfTable.c.key]).where(partsConfTable.c.key.startswith('probe|'+old))):
                old_key = row[0]
                new_key = old_key.replace('probe|'+old,'probe|'+new)
                db.session.execute(partsConfTable.update().where(partsConfTable.c.key == old_key), {'key': new_key})

            for row in db.engine.execute(select([graphTokenTable.c.key]).where(graphTokenTable.c.key.startswith(old+':'))):
                old_key = row[0]
                new_key = old_key.replace(old+':',new+':')
                db.session.execute(graphTokenTable.update().where(graphTokenTable.c.key == old_key), {'key': new_key})

            for row in Sla.query.filter_by(host_name=old).all():
                row.host_name = new

            db.session.commit()


# #########################################################################################################
# Form tools

def _fillform(form, data):
    ''' Fill form object with current conf values (edit) '''
    form.loaderrors = []
    typedata = getattr(shinken.objects, data['meta']['object_type'].title(), None)
    for k,v in data['meta']['defined_attributes'].iteritems():
        field = getattr(form, k, None)
        if field is not None:
            # Check if the data is a boolean
            if typedata and k in typedata.properties and isinstance(typedata.properties[k], BoolProp):
                # It is; normalize all different boolean syntaxes so it's only '0' or '1'
                try:
                    v = 1 if BoolProp.pythonize(v) else 0
                    field.process(None, v)
                except PythonizeError:
                    form.loaderrors.append('{0} ({1})'.format(field.label.text, k))
                    field.loaderror = 'This field contained an invalid boolean value ({0}), and has been cleared.'.format(v)
                    continue
            if isinstance(field, SelectMultipleField):
                # Split the names list into an array
                check = [i.strip() for i in v.split(',')]
                v = []
                for name, val in field.choices:
                    if name in check:
                        v.append(name)
                # Did we find everything ?
                if len(v) < len(check):
                    # No, some values missing.
                    form.loaderrors.append('{0} ({1})'.format(field.label.text, k))
                    field.loaderror = 'This field contained unkown elements ({0}), which have been removed.'.format(', '.join([i for i in check if i not in v]))
                field.process(None, v)
            elif isinstance(field, SelectField):
                # Check that the current value is available
                # If not we'll consider it to be a configuration error
                for name, val in field.choices:
                    if str(val) == str(v):
                        break
                else:
                    # Current value not available
                    form.loaderrors.append('{0} ({1})'.format(field.label.text, k))
                    field.loaderror = 'This field contained an element that does not exist ({0}), and it has been cleared.'.format(v)
                field.process(None, v)
            else:
                field.process(None, _normalizestrings(v))
    return len(form.loaderrors) == 0

#Add timeperiod exception fields to form and meta data
def _addtimeperiodsfield(form,data):
    ''' Add custom field (unsuported by pynag) '''
    data['meta']['custom'] = []
    data['meta']['descriptions'] = {}
    reg = re.compile('(.+)\s+([\d\-:]+)\s*\;?(.*)')
    tmp = {}
    removeme = []
    for d in data:
        if d and not data[d]:
            m = reg.match(d)
            if(m):
                r = m.groups()
                field = r[0].strip()
                dates = r[1]
                meta = r[2]
                data['meta']['defined_attributes'][field] = dates
                removeme.append(d);
                if field not in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']:
                    setattr(form,field, TextField(field, description= meta))
                    data['meta']['custom'].append(field)
                    data['meta']['descriptions'][field] = meta
                    tmp[field] = dates
    for d in tmp:
        data[d] = tmp[d]
    for d in removeme:
        del data[d]
        del data['meta']['defined_attributes'][d]

def _validatefullform(form,data):
    """ Validate the form, taking all template fields into acount """
    tmp = form
    for field in tmp:
        # Is the value inherited ?
        if not field.data and field.name in data['meta']['inherited_attributes']:
            field.validators.append(validators.Optional());
    return tmp.validate()

def _annotateform(form, data):
    typedata = getattr(shinken.objects, data['meta']['object_type'].title(), None)
    if typedata is None:
        return
    for field in form:
        propdata = None
        if field.name in typedata.properties:
            propdata = typedata.properties[field.name]
        # Is the value inherited ?
        if field.name in data['meta']['inherited_attributes']:
            desc = _createannotation(data['meta']['inherited_attributes'][field.name], True)
            if desc is not None:
                field.placeholder = desc
        elif propdata is not None:
            if propdata.default != none_object:
                desc = _createannotation(propdata.default, False)
                if desc is not None:
                    field.placeholder = desc

def _createannotation(value, inherited):
    """
    Generates a string that describes the default value of a property

    value contains the default value applied
    inherited tells if the default value is applied because it's inherited
    (True) or just because no value is available (False)
    """
    empty = False
    if value is None or value == ['']:
        empty = True
    elif hasattr(value, '__len__') and len(value) == 0:
        empty = True

    if empty:
        if inherited:
            return 'Default value: empty (inherited)'
        else:
            return None

    if isinstance(value, list):
        value = ', '.join(value)

    if isinstance(value, bool):
        if value:
            value = 'Yes'
        else:
            value = 'No'

    value = 'Default: {0}'.format(value)
    if inherited:
        value = value + ' (inherited)'
    return value

def _listobjects(type, key = None):
    # A template ?
    is_template = False
    if type.endswith('template'):
        is_template = True
        type = type[:-8]
    if key is None:
        if is_template:
            key = 'name'
        else:
            key = type + '_name'
    conf = _getconf()
    typekey = 'all_' + type
    if typekey in conf.data:
        result = [i[key] for i in conf.data[typekey] if key in i]
        result.sort()
        return result
    else:
        return []

def _listobjects_choices(type, addempty = False, key = None, description = None):
    """ Gets a list from _listobjects and formats it so it can work with a SelectField """
    data = _listobjects(type, key)
    data = [(i,i) for i in data]
    if addempty:
        data.insert(0, ('', '<unspecified>'))
    return data

def _listboolean_choices():
    return [('', '<unspecified>'), ('1', 'Yes'), ('0', 'No')]


##################################  SERVICES ##############################################""

@app.route('/config')
@login_required
def config_list():
    if not current_user.is_super_admin:
        abort(403)

    return render_template('config/list.html', is_locked= not _check_lock(), is_ready = _checkConf(), owner_name = _get_owner_name())

#lists, expert & delete
@app.route('/config/list/<type>')
@login_required
def conf_getdatalist(type):
    """ Returns a JSON object containing all the data for objects of the specified type """
    if not current_user.is_super_admin:
        abort(403)

    (type, istemplate) = _parsetype(type)

    if type not in _typekeys:
        return jsonify({'success': False, 'errormessage': 'Unknown object type'}), 404
    key = _typekeys[type]
    if istemplate:
        key = 'name'
    conf = _getconf()
    datakey = 'all_' + type
    if datakey in conf.data:
        data = _normalizestrings([i for i in conf['all_' + type] if key in i])
    else:
        # If the key does not exist, it's usually because no elements of that type were found in the config files
        data = []
    return jsonify({'success': True, 'data': data})

@app.route('/config/lock', methods=['GET'])
@login_required
def lockConf():
    """ Lock the conf to the current user """
    if not current_user.is_super_admin:
        abort(403)
    if not _checkConf():
        abort(403)
    success = _set_lock()
    return jsonify({'success': success})

@app.route('/config/verify', methods=['GET'])
@login_required
def checkConf():
    """ Check actual /tmp/shinken conf """
    if not current_user.is_super_admin:
        abort(403)
    if not os.path.isfile(LOCK_FILE):
        return jsonify({'success': False, 'code': 1,'message':"There is actually no changes to check"})
    if(_checkConf()):
        return jsonify({'success': True})
    with open(LAST_CHECK,'r') as filehandler:
        message = '';
        message = [message + line[18:-4] for line in filehandler if line.find('ERROR') != -1]
        return jsonify({'success': False, 'code': 2, 'message': message})

@app.route('/config/apply', methods=['POST'])
@login_required
def applyConf():
    """ Apply new conf to shinken """
    if not current_user.is_super_admin:
        abort(403)

    if not _check_lock():
        abort(403)

    #if there is no active lock then this mean that there is nothing to apply
    if not os.path.isfile(LOCK_FILE):
        abort(404)

    if not os.path.exists(TMP_DIR):
        return jsonify({'success':0, 'error': 'No changes to apply'})

    service_changed = False
    if(os.path.isfile(SERVICE_WARNING_FILE)):
        """ Display the service rename warning """
        service_changed = True

    if _checkConf():
        #Set the flag to apply new conf and restart shinken
        output = ''
        pcode = call(['mkdir','-p',WAIT_DIR])
        if pcode:
            return jsonify({'success':0, 'error': "Unable to create "+WAIT_DIR+"."})
        pcode = call(['mv','-f',TMP_DIR,WAIT_CONF_DIR])
        if pcode:
            return jsonify({'success':0, 'error': 'Error while moving files from '+TMP_DIR+' to '+WAIT_CONF_DIR})
        open(SIGNAL,'a').close()
        #delete conf cache
        cache.delete('nag_conf')
        _migrate_data()
        if(os.path.isfile(SERVICE_WARNING_FILE)):
            os.remove(SERVICE_WARNING_FILE)
        return jsonify({'success': 1, 'service_changed': service_changed})
    with open(LAST_CHECK,'r') as filehandler:
        message = ''
        message = [message + line[18:-4] for line in filehandler if line.find('ERROR') != -1]
        return jsonify({'success': 0, 'error': message})

@app.route('/config/reset', methods=['DELETE'])
@login_required
def resetConf():
    """ Remove all stagged changes """
    if not current_user.is_super_admin:
        abort(403)

    if not _check_lock():
        abort(403)

    #if there is no active lock then this mean that there is nothing to reset from
    if not os.path.isfile(LOCK_FILE):
        return jsonify({'success': True})
    os.remove(LOCK_FILE)
    pcode = call(['rm','-r',TMP_DIR])
    if pcode:
        return jsonify({'success': False, 'message': "Can't remove "+TMP_DIR})
    cache.delete('nag_conf')
    if os.path.isfile(TMP_DIR + MIGRATE_FILE):
        open(TMP_DIR + MIGRATE_FILE, 'w').close()
    return jsonify({'success': True})

@app.route('/config/logs',methods=['GET'])
@login_required
def get_check_log():
    """ Return full logs from last check """
    logs = False
    if os.path.isfile(LAST_CHECK):
        logs = []
        with open(LAST_CHECK,'r') as lastcheck:
            for f in lastcheck:
                line = f[18:-4]
                typelog = line[:4].lower()
                logs.append([typelog,line])
    return render_template('config/logs.html',log=logs)

@app.route('/config/delete/<typeid>/<objid>',methods=['GET','POST'])
@login_required
def delete_conf(typeid,objid):
    """ Delete a configuration file """
    if not current_user.is_super_admin:
        abort(403)

    if not _check_lock():
        abort(403)
    _set_lock()
    is_template = False

    if typeid.endswith('template'):
        is_template = True
        typeid = typeid[:-8]

    if is_template:
        primkey = 'name'
    else:
        primkey = _typekeys[typeid]

    targettype = getattr(pynag.Model,typeid.capitalize(),False)
    if targettype:
        args = {}
        args[primkey] = objid
        for target in targettype.objects.filter(**args):
            app.logger.debug('Removing pynag Model "{0}"'.format(args))
            target.delete()
        app.logger.debug('Done removing with Model')
    else:
        conf = _getconf()
        typekey = 'all_'+typeid
        target = next((e for e in conf.data[typekey] if primkey in e and e[primkey] == objid), None)
        filename = target['meta']['filename'];
        app.logger.debug('Removing file "{0}" because it contains object "{1}" of type "{2}"'.format(filename, objid, typeid))
        os.remove(filename)

    if is_template:
        typeid = typeid + 'template'

    #delete conf cache
    cache.delete('nag_conf')
    return redirect('/config#'+typeid)

@app.route('/config/expert/<typeid>/<objid>', methods=['GET','POST'])
@login_required
def expert_mode(typeid,objid):
    """ Edit a file in expert mode """
    if not current_user.is_super_admin:
        abort(403)

    is_template = False
    if typeid.endswith('template'):
        is_template = True
        typeid = typeid[:-8]

    if is_template:
        primkey = 'name'
    else:
        primkey = _typekeys[typeid]


    conf = _getconf()
    typekey = 'all_'+typeid
    target = next((e for e in conf.data[typekey] if primkey in e and e[primkey] == objid), None)
    filename = target['meta']['filename']

    form = ExpertForm(request.form)

    #if post let's saving
    if request.method == 'POST':
        if not _check_lock():
            abort(403)
        _set_lock()
        f = open(filename,'w')
        fdata = {k.name:k.data for k in form}
        f.write(fdata['field'])

        #delete conf cache
        cache.delete('nag_conf')
        if is_template:
            typeid = typeid + 'template'
        return redirect('/config#'+ typeid)

    #else display edit form
    f = open(filename,'r')
    getattr(form,'field').process(None,f.read())
    f.close()

    return render_template(
        'config/details-expert.html',
        filename=filename,
        form=form,
        type=typeid,
        data=False,
        id=objid,
        is_template=is_template,
        is_locked= (not _check_lock()),
        is_ready = _checkConf(),
        owner_name = _get_owner_name()
    )

#hosts
@app.route('/config/host/create', methods=['GET', 'POST'])
@login_required
def host_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('host', False, None, HostForm)

@app.route('/config/host/<objid>', methods=['GET', 'POST'])
@login_required
def host_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('host', False, objid, HostForm)

@app.route('/config/hosttemplate/<objid>', methods=['GET', 'POST'])
@login_required
def hosttemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('host', True, objid, HostForm)

#hostgroup
@app.route('/config/hostgroup/create', methods=['GET', 'POST'])
@login_required
def hostgroup_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostgroup', False, None, HostGroupForm)

@app.route('/config/hostgroup/<objid>', methods=['GET', 'POST'])
@login_required
def hostgroup_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostgroup', False, objid, HostGroupForm)

@app.route('/config/hostgrouptemplate/<objid>', methods=['GET', 'POST'])
@login_required
def hostgrouptemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostgroup', True, objid, HostGroupForm)

#services
@app.route('/config/service/create', methods=['GET', 'POST'])
@login_required
def service_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('service', False, None, ServiceForm)

@app.route('/config/service/<objid>/<containers>', methods=['GET', 'POST'])
@login_required
def service_details(objid, containers):
    """
    Shows the details page for a service. The service to show is specified with *objid* and *containers*:
    - *objid* contains the service_description
    - *containers* contains the host and hostgroup, concatenated together. The hosts are prefixed with $ and hostgroups are prefixed with +
    """
    if not current_user.is_super_admin:
        abort(403)

    # Containers mandatory
    if len(containers) == 0:
        abort(404)

    def searchservice(conf, istemplate):
        return _searchservice(conf, istemplate, objid, containers)

    return _get_details('service', False, objid + '/' + containers, ServiceForm, searchservice)

@app.route('/config/servicetemplate/<objid>', methods=['GET', 'POST'], defaults={'containers': ''})
@app.route('/config/servicetemplate/<objid>/<containers>', methods=['GET', 'POST'])
@login_required
def servicetemplate_details(objid, containers):
    """ Detail page for servicetemplate """
    if not current_user.is_super_admin:
        abort(403)

    # Containers may be empty for templates
    def searchservice(conf, istemplate):
        return _searchservice(conf, istemplate, objid, containers)

    return _get_details('service', True, objid + '/' + containers, ServiceForm, searchservice)

#servicegroup
@app.route('/config/servicegroup/create', methods=['GET', 'POST'])
@login_required
def servicegroup_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicegroup', False, None, ServiceGroupForm)

@app.route('/config/servicegroup/<objectid>', methods=['GET', 'POST'])
@login_required
def servicegroup_details(objectid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicegroup', False, objectid, ServiceGroupForm)

@app.route('/config/servicegrouptemplate/<objid>', methods=['GET', 'POST'])
@login_required
def servicegrouptemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicegroup', True, objid, ServiceGroupForm)


#contacts
@app.route('/config/contact/create', methods=['GET', 'POST'])
@login_required
def contact_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contact', False, None, ContactForm)

@app.route('/config/contact/<contactid>', methods=['GET', 'POST'])
@login_required
def contact_details(contactid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contact', False, contactid, ContactForm)

@app.route('/config/contacttemplate/<objid>', methods=['GET', 'POST'])
@login_required
def contacttemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contact', True, objid, ContactForm)

#contactgroup
@app.route('/config/contactgroup/create', methods=['GET', 'POST'])
@login_required
def contactgroup_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contactgroup', False, None, ContactGroupForm)

@app.route('/config/contactgroup/<objectid>', methods=['GET', 'POST'])
@login_required
def contactgroup_details(objectid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contactgroup', False, objectid, ContactGroupForm)

@app.route('/config/contactgrouptemplate/<objid>', methods=['GET', 'POST'])
@login_required
def contactgrouptemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('contactgroup', True, objid, ContactGroupForm)

#timeperiods
@app.route('/config/timeperiod/create', methods=['GET', 'POST'])
@login_required
def timeperiod_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('timeperiod', False, None, TimeperiodForm)

@app.route('/config/timeperiod/<objectid>', methods=['GET', 'POST'])
@login_required
def timeperiod_details(objectid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('timeperiod', False, objectid, TimeperiodForm)

@app.route('/config/timeperiodtemplate/<objid>', methods=['GET', 'POST'])
@login_required
def timeperiodtemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('timeperiod', True, objid, TimeperiodForm)

#commands
@app.route('/config/command/create', methods=['GET', 'POST'])
@login_required
def command_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('command', False, None, CommandForm)

@app.route('/config/command/<objectid>', methods=['GET', 'POST'])
@login_required
def command_details(objectid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('command', False, objectid, CommandForm)

@app.route('/config/commandtemplate/<objid>', methods=['GET', 'POST'])
@login_required
def commandtemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('command', True, objid, CommandForm)

#hostdependencies
@app.route('/config/hostdependency/create', methods=['GET', 'POST'])
@login_required
def hostdependency_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostdependency', False, None, HostDependencyForm)

@app.route('/config/hostdependency/<objid>', methods=['GET', 'POST'])
@login_required
def hostdependency_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostdependency', False, objid, HostDependencyForm)

@app.route('/config/hostdependencytemplate/<objid>', methods=['GET', 'POST'])
@login_required
def hostdependencytemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostdependency', True, objid, HostDependencyForm)

#hostescalation
@app.route('/config/hostescalation/create', methods=['GET', 'POST'])
@login_required
def hostescalation_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostescalation', False, None, HostEscalationForm)

@app.route('/config/hostescalation/<objid>', methods=['GET', 'POST'])
@login_required
def hostescalation_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostescalation', False, objid, HostEscalationForm)

@app.route('/config/hostescalationtemplate/<objid>', methods=['GET', 'POST'])
@login_required
def hostescalationtemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('hostescalation', True, objid, HostEscalationForm)

#servicedependency
@app.route('/config/servicedependency/create', methods=['GET', 'POST'])
@login_required
def servicedependency_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicedependency', False, None, ServiceDependencyForm)

@app.route('/config/servicedependency/<objid>', methods=['GET', 'POST'])
@login_required
def servicedependency_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicedependency', False, objid, ServiceDependencyForm)

@app.route('/config/servicedependencytemplate/<objid>', methods=['GET', 'POST'])
@login_required
def servicedependencytemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('servicedependency', True, objid, ServiceDependencyForm)

#serviceescalation
@app.route('/config/serviceescalation/create', methods=['GET', 'POST'])
@login_required
def serviceescalation_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('serviceescalation', False, None, ServiceEscalationForm)

@app.route('/config/serviceescalation/<objid>', methods=['GET', 'POST'])
@login_required
def serviceescalation_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('serviceescalation', False, objid, ServiceEscalationForm)

@app.route('/config/serviceescalationtemplate/<objid>', methods=['GET', 'POST'])
@login_required
def serviceescalationtemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('serviceescalation', True, objid, ServiceEscalationForm)

#notificationway
@app.route('/config/notificationway/create', methods=['GET', 'POST'])
@login_required
def notificationway_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('notificationway', False, None, NotificationWayForm)

@app.route('/config/notificationway/<objid>', methods=['GET', 'POST'])
@login_required
def notificationway_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('notificationway', False, objid, NotificationWayForm)

@app.route('/config/notificationwaytemplate/<objid>', methods=['GET', 'POST'])
@login_required
def notificationwaytemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('notificationway', True, objid, NotificationWayForm)

#realms
@app.route('/config/realm/create', methods=['GET', 'POST'])
@login_required
def realm_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('realm', False, None, RealmForm)

@app.route('/config/realm/<objid>', methods=['GET', 'POST'])
@login_required
def realm_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('realm', False, objid, RealmForm)

@app.route('/config/realmtemplate/<objid>', methods=['GET', 'POST'])
@login_required
def realmtemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('realm', True, objid, RealmForm)

#arbiter
@app.route('/config/arbiter/create', methods=['GET', 'POST'])
@login_required
def arbiter_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('arbiter', False, None, ArbiterForm)

@app.route('/config/arbiter/<objid>', methods=['GET', 'POST'])
@login_required
def arbiter_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('arbiter', False, objid, ArbiterForm)

@app.route('/config/arbitertemplate/<objid>', methods=['GET', 'POST'])
@login_required
def arbitertemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('arbiter', True, objid, ArbiterForm)

#scheduler
@app.route('/config/scheduler/create', methods=['GET', 'POST'])
@login_required
def scheduler_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('scheduler', False, None, SchedulerForm)

@app.route('/config/scheduler/<objid>', methods=['GET', 'POST'])
@login_required
def scheduler_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('scheduler', False, objid, SchedulerForm)

@app.route('/config/schedulertemplate/<objid>', methods=['GET', 'POST'])
@login_required
def schedulertemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('scheduler', True, objid, SchedulerForm)

#poller
@app.route('/config/poller/create', methods=['GET', 'POST'])
@login_required
def poller_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('poller', False, None, PollerForm)

@app.route('/config/poller/<objid>', methods=['GET', 'POST'])
@login_required
def poller_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('poller', False, objid, PollerForm)

@app.route('/config/pollertemplate/<objid>', methods=['GET', 'POST'])
@login_required
def pollertemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('poller', True, objid, PollerForm)

#reactionner
@app.route('/config/reactionner/create', methods=['GET', 'POST'])
@login_required
def reactionner_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('reactionner', False, None, ReactionnerForm)

@app.route('/config/reactionner/<objid>', methods=['GET', 'POST'])
@login_required
def reactionner_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('reactionner', False, objid, ReactionnerForm)

@app.route('/config/reactionnertemplate/<objid>', methods=['GET', 'POST'])
@login_required
def reactionnertemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('reactionner', True, objid, ReactionnerForm)

#broker
@app.route('/config/broker/create', methods=['GET', 'POST'])
@login_required
def broker_create():
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('broker', False, None, BrokerForm)

@app.route('/config/broker/<objid>', methods=['GET', 'POST'])
@login_required
def broker_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('broker', False, objid, BrokerForm)

@app.route('/config/brokertemplate/<objid>', methods=['GET', 'POST'])
@login_required
def brokertemplate_details(objid):
    if not current_user.is_super_admin:
        abort(403)
    return _get_details('broker', True, objid, BrokerForm)


# #########################################################################################################
# Forms
# TODO: Moveme to an other file

class HostForm(Form):
    #Description
    host_name = TextField(
        'Host name',
        description='This directive is used to define a short name used to identify the host. It is used in host group and service definitions to reference this particular host. Hosts can have multiple services (which are monitored) associated with them.'
    )
    alias = TextField(
        'Alias',
        [validators.Optional()],
        description='This directive is used to define a longer name or description used to identify the host. It is provided in order to allow you to more easily identify a particular host.'
    )
    display_name = TextField(
        'Display name',
        [validators.Optional()],
        description='This directive is used to define an alternate name that should be displayed in the web interface for this host. If not specified, this defaults to the value you specify for the host_name directive.'
    )
    address = TextField(
        'Address',
        description='This directive is used to define the address of the host. Normally, this is an IP address, although it could really be anything you want (so long as it can be used to check the status of the host). You can use a FQDN to identify the host instead of an IP address, but if "DNS" services are not available this could cause problems.'
    )
    notes = TextAreaField(
        'Notes',
        [validators.Optional()],
        description='This directive is used to define an optional string of notes pertaining to the host.'
    )
    notes_url = URLField(
        'Notes URL',
        [validators.Optional()],
        description='This variable is used to define an optional URL that can be used to provide more information about the host.'
    )
    action_url = URLField(
        'Action URL',
        [validators.Optional()],
        description='This directive is used to define one or more optional URL that can be used to provide more actions to be performed on the host.'
    )
    labels = TextField(
        'Labels',
        [validators.Optional()],
        description='This variable may be used to place arbitrary labels (separated by comma character). Those labels may be used in other configuration objects such as business rules grouping expressions.'
    )

    #Structure
    parents = SelectMultipleField(
        'Parents',
        [validators.Optional()],
        choices=None, # Initialized in __init__
        description='This directive is used to define a list of short names of "parent" hosts for this particular host. Parent hosts are typically routers, switches, firewalls, etc. that lie between the monitoring host and a remote hosts.'
    )
    hostgroups = SelectMultipleField(
        'Host groups',
        [validators.Optional()],
        choices=None,
        description='This directive is used to identify the short name(s) of the hostgroup(s) that the host belongs to.'
    )
    realm = SelectField(
        'Realm',
        [validators.Optional()],
        choices=None,
        description='This variable is used to define the realm where the host will be put. By putting the host in a realm, it will be manage by one of the scheduler of this realm.'
    )
    service_overrides = TextField(
        'Service overrides',
        [validators.Optional()],
        description='This variable may be used to override services directives for a specific host. This is especially useful when services are inherited (for instance from packs), because it allows to have a host attached service set one of its directives a specific value.'
    )
    service_excludes = SelectMultipleField(
        'Poller tag',
        [validators.Optional()],
        choices=None,
        description='This variable may be used to exclude a service from a host. It addresses the situations where a set of serices is inherited from a pack or attached from a hostgroup, and an identified host should NOT have one (or more, comma separated) services defined.'
    )

    #Checking
    check_command = SelectField(
        'Check command',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short name of the command that should be used to check if the host is up or down. Typically, this command would try and ping the host to see if it is "alive". The command must return a status of OK (0) or Shinken will assume the host is down. If you leave this argument blank, the host will not be actively checked. Thus, Shinken will likely always assume the host is up (it may show up as being in a "PENDING" state in the web interface). This is useful if you are monitoring printers or other devices that are frequently turned off. The maximum amount of time that the notification command can run is controlled by the host_check_timeout option.'
    )
    initial_state = SelectField(
        'Initial state',
        [validators.Optional()],
        choices=[('', '<unspecified>'), ('o','Up (o)'), ('d','Down (d)'), ('u','Unknown (u)')],
        description='By default Shinken will assume that all hosts are in UP states when in starts.'
    )
    max_check_attempts = IntegerField(
        'Maximum check attempts',
        validators=[validators.NumberRange(0)],
        description='This directive is used to define the number of times that Shinken will retry the host check command if it returns any state other than an OK state. Setting this value to 1 will cause Shinken to generate an alert without retrying the host check again.'
    )
    check_interval = IntegerField(
        'Check interval',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" between regularly scheduled checks of the host. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. More information on this value can be found in the check scheduling documentation.'
    )
    retry_interval = IntegerField(
        'Retry interval',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before scheduling a re-check of the hosts. Hosts are rescheduled at the retry interval when they have changed to a non-UP state. Once the host has been retried max_check_attempts times without a change in its status, it will revert to being scheduled at its "normal" rate as defined by the check_interval value. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes.'
    )
    active_checks_enabled = SelectField(
        'Enable active notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not active checks (either regularly scheduled or on-demand) of this host are enabled.'
    )
    passive_checks_enabled = SelectField(
        'Enable passive notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not passive checks are enabled for this host.'
    )
    check_period = SelectField(
        'Check period',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short name of the time period during which active checks of this host can be made.'
    )
    maintenance_period = SelectField(
        'Maintenance period',
        [validators.Optional()],
        choices=None,
        description='Shinken-specific variable to specify a recurring downtime period. This works like a scheduled downtime, so unlike a check_period with exclusions, checks will still be made (no "blackout" times).'
    )
    obsess_over_host = SelectField(
        'Obsess over host',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive determines whether or not checks for the host will be "obsessed" over using the ochp_command.'
    )
    check_freshness = SelectField(
        'Check freshness',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not freshness checks are enabled for this host.'
    )
    freshness_threshold = IntegerField(
        'Freshness threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the freshness threshold (in seconds) for this host. If you set this directive to a value of 0, Shinken will determine a freshness threshold to use automatically.'
    )
    poller_tag = TextField(
        'Poller tag',
        [validators.Optional()],
        description='This variable is used to define the poller_tag of the host. All checks of this hosts will only take by pollers that have this value in their poller_tags parameter.By default the pollerag value is \'None\', so all untagged pollers can take it because None is set by default for them.'
    )
    resultmodulations = SelectMultipleField(
        'Result modulations',
        [validators.Optional()],
        choices=None,
        description='This variable is used to link with resultmodulations objects. It will allow such modulation to apply, like change a warning in critical for this host.'
    )

    #Status management
    event_handler = SelectField(
        'Event handler',
        choices=None,
        description='This directive is used to specify the short name of the command that should be run whenever a change in the state of the host is detected (i.e. whenever it goes down or recovers). Read the documentation on event handlers for a more detailed explanation of how to write scripts for handling events. The maximum amount of time that the event handler command can run is controlled by the event_handler_timeout option.'
    )
    event_handler_enabled = SelectField(
        'Event handler enabled',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the event handler for this host is enabled.'
    )
    low_flap_threshold = IntegerField(
        'Low flap threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the low state change threshold used in flap detection for this host. More information on flap detection can be found here. If you set this directive to a value of 0, the program-wide value specified by the low_host_flap_threshold directive will be used.'
    )
    high_flap_threshold = IntegerField(
        'High flap threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the high state change threshold used in flap detection for this host. More information on flap detection can be found here. If you set this directive to a value of 0, the program-wide value specified by the high_host_flap_threshold directive will be used.'
    )
    flap_detection_enabled = SelectField(
        'Flap detection enabled',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not flap detection is enabled for this host. More information on flap detection can be found here.'
    )
    flap_detection_options = SelectMultipleField(
        'Flap detection options',
        [validators.Optional()],
        choices=[('o','Up (o)'), ('d','Down (d)'), ('u','Unknown (u)')],
        description='This directive is used to determine what host states the flap detection logic will use for this host.'
    )
    retain_status_information = SelectField(
        'Retain status info',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not status-related information about the host is retained across program restarts. This is only useful if you have enabled state retention using the retain_state_information directive. '
    )
    retain_nonstatus_information = SelectField(
        'Retain non-status info',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not non-status information about the host is retained across program restarts. This is only useful if you have enabled state retention using the retain_state_information directive. '
    )

    #Notifications
    notifications_enabled = SelectField(
        'Enable notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not notifications for this host are enabled.'
    )
    contacts = SelectMultipleField(
        'Contacts',
        choices=None,
        description='This is a list of the short names of the contacts that should be notified whenever there are problems (or recoveries) with this host.'
    )
    contact_groups = SelectMultipleField(
        'Contact groups',
        choices=None,
        description='This is a list of the short names of the contact groups that should be notified whenever there are problems (or recoveries) with this host.'
    )
    notification_interval = IntegerField(
        'Notification interval',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before re-notifying a contact that this service is still down or unreachable. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. If you set this value to 0, Shinken will not re-notify contacts about problems for this host - only one problem notification will be sent out.'
    )
    first_notification_delay = IntegerField(
        'First notification delay',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before sending out the first problem notification when this host enters a non-UP state. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. If you set this value to 0, Shinken will start sending out notifications immediately.'
    )
    notification_period = SelectField(
        'Notification period',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short name of the time period during which notifications of events for this host can be sent out to contacts. If a host goes down, becomes unreachable, or recoveries during a time which is not covered by the time period, no notifications will be sent out.'
    )
    notification_options = SelectMultipleField(
        'Notification options',
        [validators.Optional()],
        choices=[('d','Down (d)'), ('u','Unknown (u)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This directive is used to determine when notifications for the host should be sent out.'
    )
    escalations = SelectMultipleField(
        'Escalations',
        [validators.Optional()],
        choices=None,
        description='This variable is used to link with escalations objects. It will allow such escalations rules to appy.'
    )

    # Business rules
    business_impact = IntegerField(
        'Business impact',
        validators=[validators.Optional(), validators.NumberRange(0, 5)],
        description='This variable is used to set the importance we gave to this host for the business from the less important (0 = nearly nobody will see if it\'s in error) to the maximum (5 = you lost your job if it fail).'
    )
    business_impact_modulations = SelectMultipleField(
        'Business impact modulations',
        [validators.Optional()],
        choices=None,
        description='This variable is used to link with business_impact_modulations objects. It will allow such modulation to apply (for example if the host is a payd server, it will be important only in a specific timeperiod: near the payd day).'
    )
    business_rule_output_template = TextField(
        'Business rule output template',
        [validators.Optional()],
        description='Classic host check output is managed by the underlying plugin (the check output is the plugin stdout).'
    )
    business_rule_smart_notifications = SelectField(
        'Enable smart notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This variable may be used to activate smart notifications on business rules. This allows to stop sending notification if all underlying problems have been acknowledged.'
    )
    business_rule_downtime_as_ack = SelectField(
        'Include downtimes in smart notifications',
        [validators.Optional()],
        choices=_listboolean_choices()
    )
    business_rule_host_notification_options = SelectMultipleField(
        'Business rule host notification options',
        [validators.Optional()],
        choices=[('d','Down (d)'), ('u','Unknown (u)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This option allows to enforce business rules underlying hosts notification options to easily compose a consolidated meta check. This is especially useful for business rules relying on grouping expansion.'
    )
    business_rule_service_notification_options = SelectMultipleField(
        'Business rule service notification options',
        [validators.Optional()],
        choices=[('w','Warning (w)'), ('u','Unknown (u)'), ('c', 'Critical (c)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This option allows to enforce business rules underlying services notification options to easily compose a consolidated meta check. This is especially useful for business rules relying on grouping expansion.'
    )

    #Snapshots
    snapshot_enabled = SelectField(
        'Enable snapshot',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This option allows to enable snapshots snapshots on this element.'
    )
    snapshot_command = SelectField(
        'Snapshot command',
        [validators.Optional()],
        choices=None,
        description='Command to launch when a snapshot launch occurs'
    )
    snapshot_period = SelectField(
        'Snapshot period',
        [validators.Optional()],
        choices=None,
        description='Timeperiod when the snapshot call is allowed'
    )
    snapshot_criteria = SelectMultipleField(
        'Snapshot criteria',
        [validators.Optional()],
        choices=[('d','Down (d)'), ('u','Unknown (u)')],
        description='List of states that enable the snapshot launch. Mainly bad states.'
    )
    snapshot_interval = IntegerField(
        'Snapshot interval',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='Minimum interval between two launch of snapshots to not hammering the host, in interval_length units (by default 60s).'
    )

    # Misc.
    process_perf_data = SelectField(
        'Process perf data',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the processing of performance data is enabled for this host. '
    )
    stalking_options = SelectMultipleField(
        'Stalking options',
        [validators.Optional()],
        choices=[('o','Up (o)'), ('d','Down (d)'), ('u','Unknown (u)')],
        description='This directive determines which host states "stalking" is enabled for.'
    )
    trigger_broker_raise_enabled = SelectField(
        'Enable trigger',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This option define the behavior of the defined trigger (Default 0). If set to 1, this means the trigger will modify the output / return code of the check.'
    )
    trigger_name = TextField(
        'Trigger name',
        [validators.Optional()],
        description='This options define the trigger that will be executed after a check result (passive or active). This file trigger_name.trig has to exist in the trigger directory or sub-directories.'
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(HostForm, self).__init__(*args, **kwargs)
        self.parents.choices = _listobjects_choices('host')
        self.hostgroups.choices = _listobjects_choices('hostgroup')
        self.realm.choices = _listobjects_choices('realm', True)
        self.service_excludes.choices = _listobjects_choices('service', False, 'service_description')
        self.check_command.choices = _listobjects_choices('command', True)
        self.check_period.choices = _listobjects_choices('timeperiod', True)
        self.maintenance_period.choices = _listobjects_choices('timeperiod', True)
        self.resultmodulations.choices = _listobjects_choices('resultmodulation')
        self.event_handler.choices = _listobjects_choices('command', True)
        self.contacts.choices = _listobjects_choices('contact')
        self.contact_groups.choices = _listobjects_choices('contactgroup')
        self.notification_period.choices = _listobjects_choices('timeperiod', True)
        self.escalations.choices = _listobjects_choices('escalation')
        self.business_impact_modulations.choices = _listobjects_choices('businessimpactmodulation')
        self.snapshot_command.choices = _listobjects_choices('command', True)
        self.snapshot_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('hosttemplate')

class HostGroupForm(Form):
    # Description
    hostgroup_name = TextField(
        'Hostgroup name',
        description='This directive is used to define a short name used to identify the host group.'
    )
    alias = TextField(
        'Alias',
        description='This directive is used to define is a longer name or description used to identify the host group. It is provided in order to allow you to more easily identify a particular host group.'
    )
    notes = TextAreaField(
        'Notes',
        [validators.Optional()],
        description='This directive is used to define an optional string of notes pertaining to the host.'
    )
    notes_url = URLField(
        'Notes URL',
        [validators.Optional()],
        description='This variable is used to define an optional URL that can be used to provide more information about the host group.'
    )
    action_url = URLField(
        'Action URL',
        [validators.Optional()],
        description='This directive is used to define an optional URL that can be used to provide more actions to be performed on the host group.'
    )

    #Structure
    members = SelectMultipleField(
        'Members',
        [validators.Optional()],
        choices=None,
        description='This is a list of the short names of hosts that should be included in this group.This directive may be used as an alternative to (or in addition to) the hostgroups directive in host definitions.'
    )
    hostgroup_members = SelectMultipleField(
        'Host groups',
        [validators.Optional()],
        choices=None,
        description='This optional directive can be used to include hosts from other "sub" host groups in this host group.'
    )
    realm = SelectField(
        'Realm',
        [validators.Optional()],
        choices=None,
        description='This directive is used to define in which realm all hosts of this hostgroup will be put into. If the host are already tagged by a realm (and not the same), the value taken into account will the the one of the host (and a warning will be raised). If no realm is defined, the default one will be take.'
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(HostGroupForm, self).__init__(*args, **kwargs)
        self.members.choices = _listobjects_choices('host')
        self.hostgroup_members.choices = _listobjects_choices('hostgroup')
        self.realm.choices = _listobjects_choices('realm', True)
        self.use.choices = _listobjects_choices('hostgrouptemplate')

class ServiceForm(Form):
    #Description
    service_description = TextField(
        'Service description',
        description='This directive is used to define the description of the service, which may contain spaces, dashes, and colons (semicolons, apostrophes, and quotation marks should be avoided). No two services associated with the same host can have the same description. Services are uniquely identified with their host_name and service_description directives.'
    )
    display_name = TextField(
        'Display name',
        [validators.Optional()],
        description='This directive is used to define an alternate name that should be displayed in the web interface for this service. If not specified, this defaults to the value you specify for the service_description directive.'
    )
    notes = TextAreaField(
        'Notes',
        [validators.Optional()],
        description='This directive is used to define an optional string of notes pertaining to the service.'
    )
    notes_url = URLField(
        'Notes URL',
        [validators.Optional()],
        description='This directive is used to define an optional URL that can be used to provide more information about the service. '
    )
    action_url = URLField(
        'Action URL',
        [validators.Optional()],
        description='This directive is used to define an optional URL that can be used to provide more actions to be performed on the service. '
    )
    labels = TextField(
        'Labels',
        [validators.Optional()],
        description='This variable may be used to place arbitrary labels (separated by comma character). Those labels may be used in other configuration objects such as business rules to identify groups of services.'
    )

    # Structure
    host_name = SelectMultipleField(
        'Host',
        choices=None
    )
    # We cannot use the classic SelectMUltipleField for this field, because of the expression syntax available on this field that may get in the way
    hostgroup_name = TextField(
        'Host group',
        [validators.Optional()],
        description=''
    )
    host_dependency_enabled = SelectField(
        'Host dependency enabled',
        choices=_listboolean_choices(),
        description='This variable may be used to remove the dependency between a service and its parent host. Used for volatile services that need notification related to itself and not depend on the host notifications.'
    )
    servicegroups = SelectMultipleField(
        'Service groups',
        [validators.Optional()],
        choices=None,
        description='This directive is used to identify the short name(s) of the servicegroup(s) that the service belongs to. Multiple servicegroups should be separated by commas. This directive may be used as an alternative to using the members directive in servicegroup definitions.'
    )
    service_dependencies = SelectMultipleField(
        'Service dependencies',
        [validators.Optional()],
        choices=None,
        description='TODO advanced mode only?'
    )

    # Checking
    check_command = SelectField(
        'Check command',
        choices=None,
        description='This directive is used to specify the short name of the command that Shinken will run in order to check the status of the service. The maximum amount of time that the service check command can run is controlled by the service_check_timeout option. There is also a command with the reserved name "bp_rule". It is defined internally and has a special meaning. Unlike other commands it mustn\'t be registered in a command definition. It\'s purpose is not to execute a plugin but to represent a logical operation on the statuses of other services.'
    )
    initial_state = SelectField(
        'Initial state',
        [validators.Optional()],
        choices=[('o','Ok (o)'), ('w','Warning (w)'), ('u','Unknown (u)'), ('c','Critical (c)')],
        description='By default Shinken will assume that all services are in OK states when in starts. You can override the initial state for a service by using this directive.'
    )
    max_check_attempts = IntegerField(
        'Max check attempts',
        validators=[validators.NumberRange(0)],
        description='This directive is used to define the number of times that Shinken will retry the service check command if it returns any state other than an OK state. Setting this value to 1 will cause Shinken to generate an alert without retrying the service check again.'
    )
    check_interval = IntegerField(
        'Check interval',
        validators=[validators.NumberRange(0)],
    description='This directive is used to define the number of "time units" to wait before scheduling the next "regular" check of the service. "Regular" checks are those that occur when the service is in an OK state or when the service is in a non-OK state, but has already been rechecked max_check_attempts number of times. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. '
    )
    retry_interval = IntegerField(
        'Retry interval',
        validators=[validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before scheduling a re-check of the service. Services are rescheduled at the retry interval when they have changed to a non-OK state. Once the service has been retried max_check_attempts times without a change in its status, it will revert to being scheduled at its "normal" rate as defined by the check_interval value. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes.'
    )
    active_checks_enabled = SelectField(
        'Enable active checks',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='his directive is used to determine whether or not active checks of this service are enabled.'
    )
    passive_checks_enabled = SelectField(
        'Enable passive checks',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not passive checks of this service are enabled. '
    )
    check_period = SelectField(
        'Check period',
        choices=None,
        description='This directive is used to specify the short name of the time period during which active checks of this service can be made.'
    )
    maintenance_period = SelectField(
        'Maintenance period',
        [validators.Optional()],
        choices=None,
        description='Shinken-specific variable to specify a recurring downtime period. This works like a scheduled downtime, so unlike a check_period with exclusions, checks will still be made (no "blackout" times).'
    )
    is_volatile = SelectField(
        'Is volatile',
        [validators.Optional()],
        choices=_listboolean_choices()
    )
    obsess_over_service = SelectField(
        'Obsess over service',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive determines whether or not checks for the service will be "obsessed" over using the ocsp_command.'
    )
    check_freshness = SelectField(
        'Check freshness',
        [validators.Optional()],
        choices=_listboolean_choices(),description='This directive is used to determine whether or not freshness checks are enabled for this service.'
    )
    freshness_threshold = IntegerField(
        'Freshness threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the freshness threshold (in seconds) for this service. If you set this directive to a value of 0, Shinken will determine a freshness threshold to use automatically.'
    )
    poller_tag = TextField(
        'Poller tag',
        [validators.Optional()],
        description='This variable is used to define the poller_tag of checks from this service. All of theses checks will be taken by pollers that have this value in their poller_tags parameter. By default there is no poller_tag, so all untaggued pollers can take it.'
    ) # TODO : Show a list of existing tags + 'None' ?

    # Status management
    event_handler = SelectField(
        'Event handler',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short name of the command that should be run whenever a change in the state of the service is detected (i.e. whenever it goes down or recovers).'
    )
    event_handler_enabled = SelectField(
        'Event handler enabled',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the event handler for this service is enabled.'
    )
    flap_detection_enabled = SelectField(
        'Flap detection enabled',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not flap detection is enabled for this service.'
    )
    low_flap_threshold = IntegerField(
        'Low flap threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the low state change threshold used in flap detection for this service. More information on flap detection can be found here. If you set this directive to a value of 0, the program-wide value specified by the low_service_flap_threshold directive will be used.'
    )
    high_flap_threshold = IntegerField(
        'High flap threshold',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to specify the high state change threshold used in flap detection for this service. More information on flap detection can be found here. If you set this directive to a value of 0, the program-wide value specified by the high_service_flap_threshold directive will be used.'
    )
    flap_detection_options = SelectMultipleField(
        'Flap detection options',
        [validators.Optional()],
        choices=[('o','Ok (o)'), ('w','Warning (w)'), ('c', 'Critical (c)'), ('u','Unknown (u)')],
        description='This directive is used to determine what service states the flap detection logic will use for this service.'
    )
    retain_status_information = SelectField(
        'Retain status info',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not status-related information about the service is retained across program restarts. This is only useful if you have enabled state retention using the retain_state_information directive.'
    )
    retain_nonstatus_information = SelectField(
        'Retain non-status info',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not non-status information about the service is retained across program restarts. This is only useful if you have enabled state retention using the retain_state_information directive.'
    )

    # Notifications
    notifications_enabled = SelectField(
        'Enable notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not notifications for this service are enabled.'
    )
    contacts = SelectMultipleField(
        'Contacts',
        choices=None,
        description='This is a list of the short names of the contacts that should be notified whenever there are problems (or recoveries) with this service. Multiple contacts should be separated by commas. Useful if you want notifications to go to just a few people and don\'t want to configure contact groups. You must specify at least one contact or contact group in each service definition.'
    )
    contact_groups = SelectMultipleField(
        'Contact groups',
        choices=None,
        description='This is a list of the short names of the contact groups that should be notified whenever there are problems (or recoveries) with this service. You must specify at least one contact or contact group in each service definition.'
    )
    notification_interval = IntegerField(
        'Notification interval',
        validators=[validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before re-notifying a contact that this service is still in a non-OK state. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. If you set this value to 0, Shinken will not re-notify contacts about problems for this service - only one problem notification will be sent out.'
    )
    first_notification_delay = IntegerField(
        'First notification delay',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='This directive is used to define the number of "time units" to wait before sending out the first problem notification when this service enters a non-OK state. Unless you\'ve changed the interval_length directive from the default value of 60, this number will mean minutes. If you set this value to 0, Shinken will start sending out notifications immediately.'
    )
    notification_period = SelectField(
        'Notification period',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short name of the time period during which notifications of events for this service can be sent out to contacts. No service notifications will be sent out during times which is not covered by the time period.'
    )
    notification_options = SelectMultipleField(
        'Notification options',
        [validators.Optional()],
        choices=[('w','Warning (d)'), ('u','Unknown (u)'), ('c', 'Critical (c)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This directive is used to determine when notifications for the service should be sent out. '
    )

    # Business rules
    business_impact = IntegerField(
        'Business impact',
        validators=[validators.Optional(), validators.NumberRange(0, 5)],
        description='This variable is used to set the importance we gave to this service from the less important (0 = nearly nobody will see if it\'s in error) to the maximum (5 = you lost your job if it fail). The default value is 2.'
    )
    business_rule_output_template = TextField(
        'Business rule output template',
        [validators.Optional()],
        description='Classic service check output is managed by the underlying plugin (the check output is the plugin stdout). For business rules, as there\'s no real plugin behind, the output may be controlled by a template string defined in business_rule_output_template directive.'
    )
    business_rule_smart_notifications = SelectField(
        'Enable smart notifications',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This variable may be used to activate smart notifications on business rules. This allows to stop sending notification if all underlying problems have been acknowledged.'
    )
    business_rule_downtime_as_ack = SelectField(
        'Include downtimes in smart notifications',
        [validators.Optional()],
        choices=_listboolean_choices()
    )
    business_rule_host_notification_options = SelectMultipleField(
        'Business rule host notification options',
        [validators.Optional()],
        choices=[('d','Down (d)'), ('u','Unknown (u)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This option allows to enforce business rules underlying hosts notification options to easily compose a consolidated meta check. This is especially useful for business rules relying on grouping expansion.'
    )
    business_rule_service_notification_options = SelectMultipleField(
        'Business rule service notification options',
        [validators.Optional()],
        choices=[('w','Warning (w)'), ('u','Unknown (u)'), ('c', 'Critical (c)'), ('r', 'Recovery (r)'), ('f', 'Flapping (f)'), ('s', 'Scheduled downtime starts/ends (s)'), ('n', 'None (n)')],
        description='This option allows to enforce business rules underlying services notification options to easily compose a consolidated meta check. This is especially useful for business rules relying on grouping expansion.'
    )

    # Snapshot
    snapshot_enabled = SelectField(
        'Enable snapshot',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This option allows to enable snapshots snapshots on this element.'
    )
    snapshot_command = SelectField(
        'Snapshot command',
        [validators.Optional()],
        choices=None,
        description='Command to launch when a snapshot launch occurs.'
    )
    snapshot_period = SelectField(
        'Snapshot period',
        [validators.Optional()],
        choices=None,
        description='Timeperiod when the snapshot call is allowed.'
    )
    snapshot_criteria = SelectMultipleField(
        'Snapshot criteria',
        [validators.Optional()],
        choices=[('d','Down (d)'),('u','Unknown (u)')],
        description='List of states that enable the snapshot launch. Mainly bad states.'
    )
    snapshot_interval = IntegerField(
        'Snapshot interval',
        validators=[validators.Optional(), validators.NumberRange(0)],
        description='Minimum interval between two launch of snapshots to not hammering the host, in interval_length units (by default 60s)'
    )

    # Misc.
    process_perf_data = SelectField(
        'Process perf data',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the processing of performance data is enabled .'
    )
    stalking_options = SelectMultipleField(
        'Stalking options',
        [validators.Optional()],
        choices=[('o','Up (o)'), ('d','Down (d)'), ('u','Unknown (u)')],
        description='This directive determines which service states "stalking" is enabled for.'
    )
    duplicate_foreach = TextField(
        'Duplicate for each',
        [validators.Optional()],
        description='TODO: Advanced mode only?'
    )
    trigger_broker_raise_enabled = SelectField(
        'Enable trigger',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This option define the behavior of the defined trigger (Default 0). If set to 1, this means the trigger will modify the output / return code of the check. If 0, this means the code executed by the trigger does nothing to the check (compute something elsewhere ?) Basically, if you use one of the predefined function (trigger_functions.py) set it to 1'
    )
    trigger_name = TextField(
        'Trigger name',
        [validators.Optional()],
        description='This options define the trigger that will be executed after a check result (passive or active). This file trigger_name.trig has to exist in the trigger directory or sub-directories.'
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ServiceForm, self).__init__(*args, **kwargs)
        self.host_name.choices = _listobjects_choices('host')
        self.servicegroups.choices = _listobjects_choices('servicegroup')
        self.service_dependencies.choices = _listobjects_choices('service')
        self.check_command.choices = _listobjects_choices('command', True)
        self.check_period.choices = _listobjects_choices('timeperiod', True)
        self.maintenance_period.choices = _listobjects_choices('timeperiod', True)
        self.event_handler.choices = _listobjects_choices('command', True)
        self.contacts.choices = _listobjects_choices('contact')
        self.contact_groups.choices = _listobjects_choices('contactgroup')
        self.notification_period.choices = _listobjects_choices('timeperiod', True)
        self.snapshot_command.choices = _listobjects_choices('command', True)
        self.snapshot_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('servicetemplate')

class ServiceGroupForm(Form):
    #Description
    servicegroup_name = TextField(
        'ServiceGroup name',
        description='This directive is used to define a short name used to identify the service group.'
    )
    alias = TextField(
        'alias',
        description='This directive is used to define is a longer name or description used to identify the service group. It is provided in order to allow you to more easily identify a particular service group.'
    )
    members = SelectMultipleField(
        'Services',
        [validators.Optional()],
        choices=None,
        description='This is a list of the descriptions of services (and the names of their corresponding hosts) that should be included in this group. This directive may be used as an alternative to the servicegroups directive in service definitions.'
    )
    servicegroup_members = SelectMultipleField(
        'Services',
        [validators.Optional()],
        choices=None,
        description='This optional directive can be used to include services from other "sub" service groups in this service group. Specify a comma-delimited list of short names of other service groups whose members should be included in this group.'
    )
    notes = TextField(
        'Note string',
        [validators.Optional()],
        description='This directive is used to define an optional string of notes pertaining to the service group.'
    )
    notes_url = URLField(
        'Notes URL',
        [validators.Optional()],
        description='This directive is used to define an optional URL that can be used to provide more information about the service group.'
    )
    action_url = URLField(
        'Action URL',
        [validators.Optional()],
        description='This directive is used to define an optional URL that can be used to provide more actions to be performed on the service group.'
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ServiceGroupForm, self).__init__(*args, **kwargs)
        self.members.choices = _listobjects_choices('services', True)
        self.servicegroup_members.choices = _listobjects_choices('servicegroup', True)
        self.use.choices = _listobjects_choices('servicegrouptemplate')

class ContactForm(Form):
    #Description
    contact_name = TextField(
        'Host name',
        description='This directive is used to define a short name used to identify the contact. It is referenced in contact group definitions.'
    )
    alias = TextField(
        u'Alias',
        [validators.Optional()],
        description='This directive is used to define a longer name or description for the contact.'
    )
    contactgroups = SelectMultipleField(
        'Contact group',
        [validators.Optional()],
        choices= None,
        description='This directive is used to identify the short name(s) of the contactgroup(s) that the contact belongs to.'
    )
    host_notification_enabled = SelectField(
        'host_notification_enabled',
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the contact will receive notifications about host problems and recoveries.'
    )
    service_notification_enabled = SelectField(
        'service_notification_enabled',
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the contact will receive notifications about service problems and recoveries.'
    )
    host_notification_period = SelectField(
        'Host notification period',
        choices=None,
        description='This directive is used to specify the short name of the time period during which the contact can be notified about host problems or recoveries.'
    )
    service_notification_period = SelectField(
        'Service notification period',
        choices=None,
        description='This directive is used to specify the short name of the time period during which the contact can be notified about service problems or recoveries.'
    )
    host_notification_options = SelectMultipleField(
        'Host notification options',
        choices=[('d','d'),('u','u'),('r','r'),('f','f'),('s','s'),('n','n')],
        description='This directive is used to define the host states for which notifications can be sent out to this contact.'
    )
    service_notification_options = SelectMultipleField(
        'Service notification options',
        choices=[('w','w'),('u','u'),('c','c'),('r','r'),('f','f'),('s','s'),('n','n')],
        description='This directive is used to define the service states for which notifications can be sent out to this contact.'
    )
    host_notification_commands = TextField(
        'Host notification command',
        description='This directive is used to define a list of the short names of the commands used to notify the contact of a host problem or recovery. Multiple notification commands should be separated by commas. All notification commands are executed when the contact needs to be notified.'
    )
    server_notification_commands = TextField(
        'Service notification command',
        description='This directive is used to define a list of the short names of the commands used to notify the contact of a service problem or recovery. Multiple notification commands should be separated by commas.'
    )
    email = TextField(
        'Email',
        [validators.Optional()],
        description='This directive is used to define an email address for the contact.'
    )
    pager = TextField(
        'Pager',
        [validators.Optional()],
        description='This directive is used to define a pager number for the contact. It can also be an email address to a pager gateway.'
    )
    addressx = TextField(
        'additional_contact_address',
        [validators.Optional()],
        description='Address directives are used to define additional "addresses" for the contact. These addresses can be anything - cell phone numbers, instant messaging addresses, etc. Depending on how you configure your notification commands.'
    )
    can_submit_commands = SelectField(
        'can_submit_commands',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the contact can submit external commands to Shinken from the CGIs.'
    )
    retain_status_information = SelectField(
        'retain_status_information',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not status-related information about the contact is retained across program restarts.'
    )
    retain_nonstatus_information = SelectField(
        'retain_nonstatus_information',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not non-status information about the contact is retained across program restarts. '
    )
    min_business_impact = IntegerField(
        'Minimum business impact',
        [validators.Optional()],
        description='This directive is use to define the minimum business criticity level of a service/host the contact will be notified.'
    )
    is_admin = SelectField(
        'Is admin ?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description='This directive is used to determine whether or not the contact can see all object in WebUI.'
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ContactForm, self).__init__(*args, **kwargs)
        self.contactgroups.choices = _listobjects_choices('contactgroup', True)
        self.host_notification_period.choices = _listobjects_choices('timeperiod', True)
        self.service_notification_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('contacttemplate')

class ContactGroupForm(Form):
    #Description
    contactgroup_name = TextField(
        'Host name',
        description='This directive is a short name used to identify the contact group.'
    )
    alias = TextField(
        u'Alias',
        description='This directive is used to define a longer name or description used to identify the contact group.'
    )
    #Members
    members = SelectMultipleField(
        'Members',
        [validators.Optional()],
        choices=None,
        description='This directive is used to define a list of the short names of contacts that should be included in this group.'
    )
    contactgroup_members = SelectMultipleField(
        'Contact groups members',
        [validators.Optional()],
        choices=None,
        description='This optional directive can be used to include contacts from other "sub" contact groups in this contact group.'
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ContactGroupForm, self).__init__(*args, **kwargs)
        self.members.choices = _listobjects_choices('contact', True)
        self.contactgroup_members.choices = _listobjects_choices('contactgroup', True)
        self.use.choices = _listobjects_choices('contactgrouptemplate')

class TimeperiodForm(Form):
    #Description
    timeperiod_name = TextField(
        'Timeperiod name',
        description='This directives is the short name used to identify the time period.'
    )
    alias = TextField(
        'Alias',
        description='This directive is a longer name or description used to identify the time period.'
    )
    exclude = SelectMultipleField(
        'Excluded timeperiods',
        [validators.Optional()],
        choices=None,
        description='This directive is used to specify the short names of other timeperiod definitions whose time ranges should be excluded from this timeperiod.'
    )
    #weekdays
    sunday = TextField('Sunday', [validators.Optional()], default= '00:00-00:00')
    monday = TextField('Monday', [validators.Optional()], default= '00:00-00:00')
    tuesday = TextField('Tuesday', [validators.Optional()], default= '00:00-00:00')
    wednesday = TextField('Wednesday', [validators.Optional()], default= '00:00-00:00')
    thursday = TextField('Thursday', [validators.Optional()], default= '00:00-00:00')
    friday = TextField('Friday', [validators.Optional()], default= '00:00-00:00')
    saturday = TextField('Saturday', [validators.Optional()], default= '00:00-00:00')

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(TimeperiodForm, self).__init__(*args, **kwargs)
        self.exclude.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('timeperiodtemplate')

class CommandForm(Form):
    #Description
    command_name = TextField(
        'Command name',
        description='This directive is the short name used to identify the command. It is referenced in contact, host, and service definitions (in notification, check, and event handler directives), among other places.'
    )
    command_line = TextField(
        'Command line',
        description='This directive is used to define what is actually executed by Shinken when the command is used for service or host checks, notifications, or event handlers. Before the command line is executed, all valid macros are replaced with their respective values.'
    )
    poller_tag = TextField(
        'Poller tag',
        [validators.Optional()],
        description='This directive is used to define the poller_tag of this command. If the host/service that call this command do not override it with their own poller_tag, it will make this command if used in a check only taken by polelrs that also have this value in their poller_tags parameter. By default there is no poller_tag, so all untagged pollers can take it.'
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(CommandForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('commandtemplate')

class ExpertForm(Form):
    field = TextAreaField(u'Content')

class HostDependencyForm(Form):
    #Description
    host_name = SelectMultipleField(
        'Host name',
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the host(s) that is being depended upon (also referred to as the master host). '''
    )
    hostgroup_name = SelectMultipleField(
        'Hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the hostgroup(s) that is being depended upon (also referred to as the master host). The hostgroup_name may be used instead of, or in addition to, the host_name directive. '''
    )
    #dependent
    dependent_host_name = SelectMultipleField(
        'Dependent host name',
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the dependent host(s). '''
    )
    dependent_hostgroup_name = SelectMultipleField(
        'Dependent hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the dependent hostgroup(s). The dependent_hostgroup_name may be used instead of, or in addition to, the dependent_host_name directive. '''
    )
    #options
    inherits_parent = SelectField(
        'Inherits parent?',
        [validators.Optional()],
        choices = _listboolean_choices(),
        description = ''' This directive indicates whether or not the dependency inherits dependencies of the service that is being depended upon (also referred to as the master service). In other words, if the master service is dependent upon other services and any one of those dependencies fail, this dependency will also fail. '''
    )
    execution_failure_criteria = SelectMultipleField(
        'Execution failure criteria',
        [validators.Optional()],
        choices = [('o','o'),('w','w'),('u','u'),('c','c'),('p','p'),('n','n')],
        description = ''' This directive is used to specify the criteria that determine when the dependent service should not be actively checked. If the master service is in one of the failure states we specify, the dependent service will not be actively checked. '''
    )
    notification_failure_criteria = SelectMultipleField(
        'Notification failure criteria',
        [validators.Optional()],
        choices = [('o','o'),('w','w'),('u','u'),('c','c'),('p','p'),('n','n')],
        description = ''' This directive is used to define the criteria that determine when notifications for the dependent service should not be sent out. If the master service is in one of the failure states we specify, notifications for the dependent service will not be sent to contacts. '''
    )
    dependency_period = SelectField(
        'Dependency period',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which this dependency is valid. If this directive is not specified, the dependency is considered to be valid during all times. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(HostDependencyForm, self).__init__(*args, **kwargs)
        self.host_name.choices = _listobjects_choices('host', True)
        self.hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.dependent_host_name.choices = _listobjects_choices('host', True)
        self.dependent_hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.dependency_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('hostdependencytemplate')

class HostEscalationForm(Form):
    #Description
    host_name = SelectField(
        'Host name',
        choices = None,
        description = ''' This directive is used to identify the short name of the host that the escalation should apply to. '''
    )
    hostgroup_name = SelectMultipleField(
        'Hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the hostgroup(s) that the escalation should apply to. Multiple hostgroups should be separated by commas. If this is used, the escalation will apply to all hosts that are members of the specified hostgroup(s). '''
    )
    contacts = SelectMultipleField(
        'Contacts',
        choices = None,
        description = ''' This is a list of the short names of the contacts that should be notified whenever there are problems (or recoveries) with this service. Multiple contacts should be separated by commas. Useful if you want notifications to go to just a few people and don't want to configure contact groups. You must specify at least one contact or contact group in each service escalation definition. '''
    )
    contact_groups = SelectMultipleField(
        'Contactgroups',
        choices = None,
        description = ''' This directive is used to identify the short name of the contact group that should be notified when the service notification is escalated. Multiple contact groups should be separated by commas. You must specify at least one contact or contact group in each service escalation definition. '''
    )
    first_notification = IntegerField(
        'First notification',
        description = ''' This directive is a number that identifies the first notification for which this escalation is effective. For instance, if you set this value to 3, this escalation will only be used if the service is in a non-OK state long enough for a third notification to go out. '''
    )
    last_notification = IntegerField(
        'Last notification',
        description = ''' This directive is a number that identifies the last notification for which this escalation is effective. For instance, if you set this value to 5, this escalation will not be used if more than five notifications are sent out for the service. Setting this value to 0 means to keep using this escalation entry forever (no matter how many notifications go out). '''
    )
    first_notification_time = IntegerField(
        'First notification time',
        [validators.Optional()],
        description = ''' This directive is the number of "time intervals" (60 seconds by default) until that makes the first notification for which this escalation is effective. For instance, if you set this value to 60, this escalation will only be used if the service is in a non-OK state long enough for 60 minutes notification to go out. '''
    )
    last_notification_time = IntegerField(
        'Last notification time',
        [validators.Optional()],
        description = ''' This directive is a number of "time intervals" (60 seconds by default) until that makes the last notification for which this escalation is effective. For instance, if you set this value to 120, this escalation will not be used if more than two hours after then notifications are sent out for the service. Setting this value to 0 means to keep using this escalation entry forever (no matter how many notifications go out). '''
    )
    notification_interval = IntegerField(
        'Notification interval',
        description = ''' This directive is used to determine the interval at which notifications should be made while this escalation is valid. If you specify a value of 0 for the interval, Shinken will send the first notification when this escalation definition is valid, but will then prevent any more problem notifications from being sent out for the host. Notifications are sent out again until the host recovers. This is useful if you want to stop having notifications sent out after a certain amount of time. If multiple escalation entries for a host overlap for one or more notification ranges, the smallest notification interval from all escalation entries is used.'''
    )
    escalation_period = SelectField(
        'Escalation period',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which this escalation is valid. If this directive is not specified, the escalation is considered to be valid during all times. '''
    )
    escalation_options = SelectMultipleField(
        'Escalation options',
        [validators.Optional()],
        choices = [('w','w'),('u','u'),('c','c'),('r','r')],
        description = ''' This directive is used to define the criteria that determine when this service escalation is used. The escalation is used only if the service is in one of the states specified in this directive. If this directive is not specified in a service escalation, the escalation is considered to be valid during all service states. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(HostEscalationForm, self).__init__(*args, **kwargs)
        self.host_name.choices = _listobjects_choices('host', True)
        self.hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.contacts.choices = _listobjects_choices('contacts', True)
        self.contact_groups.choices = _listobjects_choices('contact_groups', True)
        self.escalation_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('hostescalationtemplate')

class ServiceDependencyForm(Form):
    #Description
    service_description = SelectField(
        'Service description',
        choices = None,
        description = ''' This directive is description of the service which the data is associated with. '''
    )
    host_name = SelectMultipleField(
        'Host name',
        choices = None,
        description = ''' This directive is used to identify the short name of the host that the service is associated with. '''
    )
    hostgroup_name = SelectMultipleField(
        'Hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name(s) of the hostgroup(s) that the service escalation should apply to or is associated with. The "hostgroup_name" may be used instead of, or in addition to, the "host_name" directive. '''
    )
    #dependent
    dependent_host_name = SelectMultipleField(
        'Dependent host name',
        choices = None,
        description = ''' This directive is used to identify the short name(s) of the host(s) that the dependent service "runs" on or is associated with. Multiple hosts should be separated by commas. Leaving this directive blank can be used to create "same host" dependencies. '''
    )
    dependent_hostgroup_name = SelectMultipleField(
        'Dependent hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name(s) of the hostgroup(s) that the dependent service "runs" on or is associated with. Multiple hostgroups should be separated by commas. The "dependent_hostgroup" may be used instead of, or in addition to, the "dependent_host" directive.  '''
    )
    dependent_service_description = SelectField(
        'Dependent service description',
        choices = None,
        description = ''' This directive is used to identify the description of the dependent service. '''
    )
    #options
    inherits_parent = SelectField(
        'Inherits parent?',
        [validators.Optional()],
        choices = _listboolean_choices(),
        description = ''' This directive indicates whether or not the dependency inherits dependencies of the service that is being depended upon (also referred to as the master service). In other words, if the master service is dependent upon other services and any one of those dependencies fail, this dependency will also fail. '''
    )
    execution_failure_criteria = SelectMultipleField(
        'Execution failure criteria',
        [validators.Optional()],
        choices = [('o','o'),('w','w'),('u','u'),('c','c'),('p','p'),('n','n')],
        description = ''' This directive is used to specify the criteria that determine when the dependent service should not be actively checked. If the master service is in one of the failure states we specify, the dependent service will not be actively checked. '''
    )
    notification_failure_criteria = SelectMultipleField(
        'Notification failure criteria',
        [validators.Optional()],
        choices = [('o','o'),('w','w'),('u','u'),('c','c'),('p','p'),('n','n')],
        description = ''' This directive is used to define the criteria that determine when notifications for the dependent service should not be sent out. If the master service is in one of the failure states we specify, notifications for the dependent service will not be sent to contacts. '''
    )
    dependency_period = SelectField(
        'Dependency period',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which this dependency is valid. If this directive is not specified, the dependency is considered to be valid during all times. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ServiceDependencyForm, self).__init__(*args, **kwargs)
        self.service_description.choices = _listobjects_choices('service', True)
        self.host_name.choices = _listobjects_choices('host', True)
        self.hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.dependent_host_name.choices = _listobjects_choices('host', True)
        self.dependent_hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.dependent_service_description.choices = _listobjects_choices('service', True)
        self.dependency_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('servicedependencytemplate')

class ServiceEscalationForm(Form):
    #Description
    service_description = SelectField(
        'Service description',
        choices = None,
        description = ''' This directive is description of the service which the data is associated with. '''
    )
    host_name = SelectMultipleField(
        'Host name',
        choices = None,
        description = ''' This directive is used to identify the short name of the host that the service is associated with. '''
    )
    hostgroup_name = SelectMultipleField(
        'Hostgroup name',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name(s) of the hostgroup(s) that the service escalation should apply to or is associated with. The "hostgroup_name" may be used instead of, or in addition to, the "host_name" directive. '''
    )
    contacts = SelectMultipleField(
        'Contacts',
        choices = None,
        description = ''' This is a list of the short names of the contacts that should be notified whenever there are problems (or recoveries) with this service. Multiple contacts should be separated by commas. Useful if you want notifications to go to just a few people and don't want to configure contact groups. You must specify at least one contact or contact group in each service escalation definition. '''
    )
    contact_groups = SelectMultipleField(
        'Contactgroups',
        choices = None,
        description = ''' This directive is used to identify the short name of the contact group that should be notified when the service notification is escalated. Multiple contact groups should be separated by commas. You must specify at least one contact or contact group in each service escalation definition. '''
    )
    first_notification = IntegerField(
        'First notification',
        description = ''' This directive is a number that identifies the first notification for which this escalation is effective. For instance, if you set this value to 3, this escalation will only be used if the service is in a non-OK state long enough for a third notification to go out. '''
    )
    last_notification = IntegerField(
        'Last notification',
        description = ''' This directive is a number that identifies the last notification for which this escalation is effective. For instance, if you set this value to 5, this escalation will not be used if more than five notifications are sent out for the service. Setting this value to 0 means to keep using this escalation entry forever (no matter how many notifications go out). '''
    )
    first_notification_time = IntegerField(
        'First notification time',
        [validators.Optional()],
        description = ''' This directive is the number of "time intervals" (60 seconds by default) until that makes the first notification for which this escalation is effective. For instance, if you set this value to 60, this escalation will only be used if the service is in a non-OK state long enough for 60 minutes notification to go out. '''
    )
    last_notification_time = IntegerField(
        'Last notification time',
        [validators.Optional()],
        description = ''' This directive is a number of "time intervals" (60 seconds by default) until that makes the last notification for which this escalation is effective. For instance, if you set this value to 120, this escalation will not be used if more than two hours after then notifications are sent out for the service. Setting this value to 0 means to keep using this escalation entry forever (no matter how many notifications go out). '''
    )
    notification_interval = IntegerField(
        'Notification interval',
        description = ''' This directive is used to determine the interval at which notifications should be made while this escalation is valid. If you specify a value of 0 for the interval, Shinken will send the first notification when this escalation definition is valid, but will then prevent any more problem notifications from being sent out for the host. Notifications are sent out again until the host recovers. This is useful if you want to stop having notifications sent out after a certain amount of time. If multiple escalation entries for a host overlap for one or more notification ranges, the smallest notification interval from all escalation entries is used.
 '''
    )
    escalation_period = SelectField(
        'Escalation period',
        [validators.Optional()],
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which this escalation is valid. If this directive is not specified, the escalation is considered to be valid during all times. '''
    )
    escalation_options = SelectMultipleField(
        'Escalation options',
        [validators.Optional()],
        choices = [('w','w'),('u','u'),('c','c'),('r','r')],
        description = ''' This directive is used to define the criteria that determine when this service escalation is used. The escalation is used only if the service is in one of the states specified in this directive. If this directive is not specified in a service escalation, the escalation is considered to be valid during all service states. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ServiceEscalationForm, self).__init__(*args, **kwargs)
        self.service_description.choices = _listobjects_choices('service', True)
        self.host_name.choices = _listobjects_choices('host', True)
        self.hostgroup_name.choices = _listobjects_choices('hostgroup', True)
        self.contacts.choices = _listobjects_choices('contacts', True)
        self.contact_groups.choices = _listobjects_choices('contact_groups', True)
        self.escalation_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('serviceescalationtemplate')

class NotificationWayForm(Form):
    #Description
    notificationway_name = TextField(
        'Name',
        description = ''' This directive define the name of the notification witch be specified further in a contact definition. '''
    )
    host_notification_period = SelectField(
        'Host notification period',
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which the contact can be notified about host problems or recoveries. You can think of this as an "on call" time for host notifications for the contact. Read the documentation on time periods for more information on how this works and potential problems that may result from improper use. '''
    )
    service_notification_period = SelectField(
        'Service notification period',
        choices = None,
        description = ''' This directive is used to specify the short name of the time period during which the contact can be notified about service problems or recoveries. You can think of this as an "on call" time for service notifications for the contact. Read the documentation on time periods for more information on how this works and potential problems that may result from improper use. '''
    )
    host_notification_options = SelectMultipleField(
        'Host notification options',
        choices = [('d','d'),('u','u'),('r','r'),('f','f'),('s','s'),('n','n')],
        description = ''' This directive is used to define the host states for which notifications can be sent out to this contact. '''
    )
    service_notification_options = SelectMultipleField(
        'Host notification options',
        choices = [('w','w'),('u','u'),('c','c'),('r','r'),('f','f'),('s','s'),('n','n')],
        description = ''' This directive is used to define the service states for which notifications can be sent out to this contact. '''
    )
    host_notification_commands = TextField(
        'Host notification commands',
        description = ''' This directive is used to define a list of the short names of the commands used to notify the contact of a host problem or recovery. Multiple notification commands should be separated by commas. All notification commands are executed when the contact needs to be notified. The maximum amount of time that a notification command can run is controlled by the notification_timeout option. '''
    )
    service_notification_commands = TextField(
        'Service notification commands',
        description = ''' This directive is used to define a list of the short names of the commands used to notify the contact of a service problem or recovery. Multiple notification commands should be separated by commas. All notification commands are executed when the contact needs to be notified. The maximum amount of time that a notification command can run is controlled by the notification_timeout option. '''
    )
    min_business_impact = SelectField(
        'Min business impact',
        [validators.Optional()],
        choices = [(0,0),(1,1),(2,2),(3,3),(4,4),(5,5)],
        description = ''' '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(NotificationWayForm, self).__init__(*args, **kwargs)
        self.host_notification_period.choices = _listobjects_choices('timeperiod', True)
        self.service_notification_period.choices = _listobjects_choices('timeperiod', True)
        self.use.choices = _listobjects_choices('notificationwaytemplate')

class RealmForm(Form):
    #Description
    realm_name = TextField(
        'Realm name',
        description = ''' This variable is used to identify the short name of the realm which the data is associated with. '''
    )
    realm_members = SelectField(
        'Realm members',
        [validators.Optional()],
        choices=None, # Initialized in __init__
        description = ''' This directive is used to define the sub-realms of this realms. '''
    )
    default = SelectField(
        'Default',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This directive is used to define tis this realm is the default one (untagged host and satellites wil be put into it). The default value is 0. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None # Initialized in __init__
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )
    def __init__(self, *args, **kwargs):
        super(RealmForm, self).__init__(*args, **kwargs)
        self.realm_members.choices = _listobjects_choices('realm', True)
        self.use.choices = _listobjects_choices('realmtemplate')


class ArbiterForm(Form):
    #Description
    arbiter_name = TextField(
        'Arbiter name',
        description = ''' This variable is used to identify the short name of the arbiter which the data is associated with. '''
    )
    address = TextField(
        'Address',
        description = ''' This directive is used to define the address from where the main arbier can reach this broker. This can be a DNS name or a IP address. '''
    )
    host_name = TextField(
        'Host name',
        description = ''' '''
    )
    port = IntegerField(
        'Port',
        [validators.Optional()],
        description = ''' This directive is used to define the TCP port used bu the daemon. The default value is 7772. '''
    )
    spare = SelectField(
        'Spare',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker must be managed as a spare one (will take the conf only if a master failed). The default value is 0 (master). '''
    )
    modules = TextField(
        'Modules',
        [validators.Optional()],
        description = ''' This variable is used to define all modules that the broker will load. The main goal ofthe Broker is to give status to theses modules. '''
    )
    #config
    timeout = IntegerField(
        'Timeout',
        [validators.Optional()],
        description = ''' Ping timeout '''
    )
    data_timeout = IntegerField(
        'Data timeout',
        [validators.Optional()],
        description = ''' Data send timeout '''
    )
    max_check_attempts= IntegerField(
        'Max check attempts',
        [validators.Optional()],
        description = ''' If ping fails N or more, then the node is dead '''
    )
    check_interval = IntegerField(
        'Check interval',
        [validators.Optional()],
        description = ''' Ping node every N seconds '''
    )
    accept_passive_unknown_check_results = SelectField(
        'Accept passive unknown check results?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' If this is enabled, the scheduler will accept passive check results for unconfigured hosts and will generate unknown host/service check result broks. '''
    )

    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ArbiterForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('arbitertemplate')

class SchedulerForm(Form):
    #Description
    scheduler_name = TextField(
        'Scheduler name',
        description = ''' This variable is used to identify the short name of the scheduler which the data is associated with. '''
    )
    address = TextField(
        'Address',
        description = ''' This directive is used to define the address from where the main arbier can reach this broker. This can be a DNS name or a IP address. '''
    )
    port = IntegerField(
        'Port',
        [validators.Optional()],
        description = ''' This directive is used to define the TCP port used bu the daemon. The default value is 7772. '''
    )
    spare = SelectField(
        'Spare',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker must be managed as a spare one (will take the conf only if a master failed). The default value is 0 (master). '''
    )
    realm = TextField(
        'Realm',
        [validators.Optional()],
        description = ''' This variable is used to define the realm where the broker will be put. If none is selected, it will be assigned to the default one. '''
    )
    modules = TextField(
        'Modules',
        [validators.Optional()],
        description = ''' This variable is used to define all modules that the broker will load. The main goal ofthe Broker is to give status to theses modules. '''
    )
    #Config
    weight = IntegerField(
        'Weight',
        [validators.Optional()],
        description = ''' Some schedulers can manage more hosts than others '''
    )
    timeout = IntegerField(
        'Timeout',
        [validators.Optional()],
        description = ''' Ping timeout '''
    )
    data_timeout = IntegerField(
        'Data timeout',
        [validators.Optional()],
        description = ''' Data send timeout '''
    )
    max_check_attempts= IntegerField(
        'Max check attempts',
        [validators.Optional()],
        description = ''' If ping fails N or more, then the node is dead '''
    )
    check_interval = IntegerField(
        'Check interval',
        [validators.Optional()],
        description = ''' Ping node every N seconds '''
    )
    accept_passive_unknown_check_results = SelectField(
        'Accept passive unknown check results?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' If this is enabled, the scheduler will accept passive check results for unconfigured hosts and will generate unknown host/service check result broks. '''
    )
    #Advanced
    skip_initial_broks = SelectField(
        'Skip initial broks (experimental!)',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' Skip initial broks creation for faster boot time. Experimental feature which is not stable. '''
    )
    satellitemap = TextField(
        'Satellite map',
        [validators.Optional()],
        description = ''' In NATted environments, you declare each satellite ip[:port] as seen by *this* scheduler (if port not set, the port declared by satellite itself is used)'''
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(SchedulerForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('schedulertemplate')

class PollerForm(Form):
    #Description
    poller_name = TextField(
        'Poller name',
        description = ''' This variable is used to identify the short name of the poller which the data is associated with. '''
    )
    address = TextField(
        'Address',
        description = ''' This directive is used to define the address from where the main arbier can reach this broker. This can be a DNS name or a IP address. '''
    )
    port = IntegerField(
        'Port',
        [validators.Optional()],
        description = ''' This directive is used to define the TCP port used bu the daemon. The default value is 7772. '''
    )
    spare = SelectField(
        'Spare',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker must be managed as a spare one (will take the conf only if a master failed). The default value is 0 (master). '''
    )
    realm = TextField(
        'Realm',
        [validators.Optional()],
        description = ''' This variable is used to define the realm where the broker will be put. If none is selected, it will be assigned to the default one. '''
    )
    poller_tags = TextField(
        'Poller tags',
        [validators.Optional()],
        description = ''' This variable is used to define the checks the poller can take. If no poller_tags is defined, poller will take all untagued checks. If at least one tag is defined, it will take only the checks that are also taggued like it. By default, there is no poller_tag, so poller can take all untagued checks (default).  '''
    )
    manage_sub_realms = SelectField(
        'Manage sub realms?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker will take jobs from scheduler from the sub-realms of it's realm. The default value is 1. '''
    )
    modules = TextField(
        'Modules',
        [validators.Optional()],
        description = ''' This variable is used to define all modules that the broker will load. The main goal ofthe Broker is to give status to theses modules. '''
    )
    #Config
    min_workers = IntegerField(
        'Min workers',
        [validators.Optional()],
        description = ''' Starts with N processes (0 = 1 per CPU) '''
    )
    max_workers = IntegerField(
        'max workers',
        [validators.Optional()],
        description = ''' No more than N processes (0 = 1 per CPU) '''
    )
    polling_interval = IntegerField(
        'Polling interval',
        [validators.Optional()],
        description = ''' Get jobs from schedulers each N second(s) '''
    )
    process_by_worker = IntegerField(
        'Process by worker',
        [validators.Optional()],
        description = ''' Each worker manages N checks '''
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(PollerForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('pollertemplate')

class ReactionnerForm(Form):
    #Description
    reactionner_name = TextField(
        'Reactioner name',
        description = ''' This variable is used to identify the short name of the reactioner which the data is associated with. '''
    )
    address = TextField(
        'Address',
        description = ''' This directive is used to define the address from where the main arbier can reach this broker. This can be a DNS name or a IP address. '''
    )
    port = IntegerField(
        'Port',
        [validators.Optional()],
        description = ''' This directive is used to define the TCP port used bu the daemon. The default value is 7772. '''
    )
    spare = SelectField(
        'Spare',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker must be managed as a spare one (will take the conf only if a master failed). The default value is 0 (master). '''
    )
    realm = TextField(
        'Realm',
        [validators.Optional()],
        description = ''' This variable is used to define the realm where the broker will be put. If none is selected, it will be assigned to the default one. '''
    )
    reactionner_tags = TextField(
        'Reactionner tags',
        [validators.Optional()],
        description = ''' This variable is used to define the checks the reactionner can take. If no reactionner_tags is defined, reactionner will take all untagued notifications and event handlers. If at least one tag is defined, it will take only the checks that are also taggued like it. '''
    )
    manage_sub_realms = SelectField(
        'Manage sub realms?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker will take jobs from scheduler from the sub-realms of it's realm. The default value is 1. '''
    )
    modules = TextField(
        'Modules',
        [validators.Optional()],
        description = ''' This variable is used to define all modules that the broker will load. The main goal ofthe Broker is to give status to theses modules. '''
    )

    #Config
    min_workers = IntegerField(
        'Min workers',
        [validators.Optional()],
        description = ''' Starts with N processes (0 = 1 per CPU) '''
    )
    max_workers = IntegerField(
        'max workers',
        [validators.Optional()],
        description = ''' No more than N processes (0 = 1 per CPU) '''
    )
    polling_interval = IntegerField(
        'Polling interval',
        [validators.Optional()],
        description = ''' Get jobs from schedulers each N second(s) '''
    )
    timeout = IntegerField(
        'Timeout',
        [validators.Optional()],
        description = ''' Ping timeout '''
    )
    data_timeout = IntegerField(
        'data timeout',
        [validators.Optional()],
        description = ''' Data send timeout '''
    )
    max_check_attempts = IntegerField(
        'Max checks attempts',
        [validators.Optional()],
        description = ''' If ping fails N or more, then the node is dead '''
    )
    check_interval = IntegerField(
        'Check interval',
        [validators.Optional()],
        description = ''' Ping node every N seconds '''
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(ReactionnerForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('reactionnertemplate')

class BrokerForm(Form):
    #Description
    broker_name = TextField(
        'Broker name',
        description = ''' This variable is used to identify the short name of the broker which the data is associated with. '''
    )
    address = TextField(
        'Address',
        description = ''' This directive is used to define the address from where the main arbier can reach this broker. This can be a DNS name or a IP address. '''
    )
    port = IntegerField(
        'Port',
        [validators.Optional()],
        description = ''' This directive is used to define the TCP port used bu the daemon. The default value is 7772. '''
    )
    spare = SelectField(
        'Spare',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker must be managed as a spare one (will take the conf only if a master failed). The default value is 0 (master). '''
    )
    realm = TextField(
        'Realm',
        [validators.Optional()],
        description = ''' This variable is used to define the realm where the broker will be put. If none is selected, it will be assigned to the default one. '''
    )
    manage_arbiters = SelectField(
        'Manage arbiters?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker will take jobs from scheduler from the sub-realms of it's realm. The default value is 1. '''
    )
    manage_sub_realms = SelectField(
        'Manage sub realms?',
        [validators.Optional()],
        choices=_listboolean_choices(),
        description = ''' This variable is used to define if the broker will take jobs from scheduler from the sub-realms of it's realm. The default value is 1. '''
    )
    modules = TextField(
        'Modules',
        [validators.Optional()],
        description = ''' This variable is used to define all modules that the broker will load. The main goal ofthe Broker is to give status to theses modules. '''
    )
    timeout = IntegerField(
        'Timeout',
        [validators.Optional()],
        description = ''' Ping timeout '''
    )
    data_timeout = IntegerField(
        'data timeout',
        [validators.Optional()],
        description = ''' Data send timeout '''
    )
    max_check_attempts = IntegerField(
        'Max checks attempts',
        [validators.Optional()],
        description = ''' If ping fails N or more, then the node is dead '''
    )
    check_interval = IntegerField(
        'Check interval',
        [validators.Optional()],
        description = ''' Ping node every N seconds '''
    )
    # Templates
    name = TextField(
        'Template name',
        [validators.Optional()],
        description=''
    )
    use = SelectMultipleField(
        'Template used',
        [validators.Optional()],
        choices=None
    )
    register = SelectField(
        'Register',
        [validators.Optional()],
        choices=_listboolean_choices()
    )

    def __init__(self, *args, **kwargs):
        super(BrokerForm, self).__init__(*args, **kwargs)
        self.use.choices = _listobjects_choices('brokertemplate')
