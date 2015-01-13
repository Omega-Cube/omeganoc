#!/usr/bin/env python
#
# This file is part of Omega Noc
# Copyright Omega Noc (C) 2014 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
# Kiril Gashteovski, kiril@omegacube.fr
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

""" Contains tools used to display graphs of the monitored architecture

    Note that the layout work is done on client side, and then sent back 
    to the server that stores the layed out positions for this user.

"""
import re
# deep copy import (copying of lists)
from copy import deepcopy
from math import ceil, sin, cos, floor, pi, sqrt
from random import uniform
from json import JSONEncoder

from flask import abort, json, render_template, request
from flask.ext.login import login_required, current_user
from sqlalchemy import Table
from sqlalchemy.sql import select, bindparam, func

# Imports for networkx
import networkx as nx

import igraph as ig

from on_reader.livestatus import livestatus, get_all_hosts, get_all_services

from . import app, db, utils
from ajax import jsondump

# Defines the default space between two nodes.
# The different algoriths in this files will try to aim for this
# value whenever possible
_base_node_spacing = 60

class DependencyError(Exception):
    """ Exception raised by a method that cannot be called because it requires
        a dependency that is not installed.
    """
    def __init__(self, functionnality, dep_name):
        self.dependency_name = dep_name
        self.functionnality = functionnality
        
    def __str__(self):
        return "Could not use functionality '%s': dependency '%s' is not available." % (self.functionnality, self.dependency_name)

class GraphTypeError(Exception):
    """ Exception raised when an unknown graph type name is sent to the backend graph state functions """
    def __init__(self, graphname, message = None):
        self.graphname = graphname
        if message is None:
            self.message = "The following graph name is invalid : {0}".format(graphname)
        else:
            self.message = message

# BEGIN : Common Graph struture tools
    
class GraphNode(object):
    def __init__(self, id, label, category, shinken_type, **kwargs):
        self.id = id
        self.label = label
        self.x = 0
        self.y = 0
        self.placed = False
        self.link_in = []
        self.link_out = []
        self.category = category
        self.shinken_type = shinken_type
        self.attributes = kwargs
        self.group = None
        self.radius = 30

    def __eq__(self, other):
        if other is None:
            return False
        else:
            return self.id == other.id

    def __hash__(self):
        return hash(self.id)

class GraphEdge(object):
    def __init__(self, source_node, target_node, shinken_type, **kwargs):
        self.source = source_node
        self.target = target_node
        self.shinken_type = shinken_type
        self.attributes = kwargs


    def __key(self):
        return (None if self.source is None else self.source.id, None if self.target is None else self.target.id)

    def __eq__(self, other):
        return self.__key() == other.__key()

    def __hash__(self):
        return hash(self.__key())
            
class GraphBase(object):
    """ A simple graph object that may be used directly or derived into more specialized ones """
    def __init__(self):
        self.nodes = {}
        self.__linked_nodes = None
        self.__unlinked_nodes = None

    def __cache_linked_nodes(self):
        if self.__linked_nodes is None:
            self.__linked_nodes = {}
            self.__unlinked_nodes = {}
            for n in self.nodes.itervalues():
                link_in, link_out = self.get_local_links(n)
                if len(link_in) == 0 and len(link_out) == 0:
                    self.__unlinked_nodes[n.id] = n
                else:
                    self.__linked_nodes[n.id] = n

    def clear_positions(self):
        for n in self.nodes.values():
            n.placed = False
            n.x = 0
            n.y = 0

            
    def extract_linked_nodes(self):
        """ Returns a graph object containing only the linked (non isolated) nodes of this graph """
        self.__cache_linked_nodes()
        result = GraphBase()
        result.nodes = self.__linked_nodes
        return result

    def extract_unlinked_nodes(self):
        self.__cache_linked_nodes()
        result = GraphBase()
        result.nodes = self.__unlinked_nodes
        return result

    def get_bounds(self):
        """
            Returns a tuple containing the left, top, bottom and right border positions of the entire graph's bounding box,
            as well as a boolean specifying if any nodes were actually found to create this bounding box.
            Note that only placed nodes are included to compute the bounding box
        """
        xminlist = [n.x - n.radius for n in self.nodes.itervalues() if n.placed]
        xmaxlist = [n.x + n.radius for n in self.nodes.itervalues() if n.placed]
        yminlist = [n.y - n.radius for n in self.nodes.itervalues() if n.placed]
        ymaxlist = [n.y + n.radius for n in self.nodes.itervalues() if n.placed]
        if len(xminlist) == 0:
            return (0, 0, 0, 0, False)
        return (min(xminlist),
                min(yminlist),
                max(xmaxlist),
                max(ymaxlist),
                True)

    def normalize(self):
        """ Moves all the placed nodes by the same amount, so that the top-left corner of the bbox becomes (0,0) """
        bbox_left, bbox_top, bbox_right, bbox_bottom, has_content = self.get_bounds()
        if has_content:
            for n in self.nodes.values():
                n.x -= bbox_left
                n.y -= bbox_top

    def get_node_with_most_links(self):
        if len(self.nodes) == 0:
            return None
        max_links = -1
        result = None
        for n in self.nodes:
            l_count = len(self.nodes[n].link_in) + len(self.nodes[n].link_out)
            if l_count > max_links:
                max_links = l_count
                result = self.nodes[n]
        return result

    def clear_cache(self):
        self.__linked_nodes = None
        self.__unlinked_nodes = None

    def get_local_links(self, node):
        """ Returns a tuple containing edges of a node (link_in, link_out), but only with edges whose source and target are inside this graph """
        if node is None or node.id not in self.nodes:
            return ([], [])
        else:
            return ([e for e in node.link_in if e.source.id in self.nodes],
                    [e for e in node.link_out if e.target.id in self.nodes])

    def move_by(self, x, y):
        for n in self.nodes.values():
            if n.placed:
                n.x += x
                n.y += y

    def is_empty(self):
        return len(self.nodes) == 0

    def scale(self, x, y):
        for n in self.nodes.values():
            if n.placed:
                n.x *= x
                n.y *= y

    def get_maximum_radius(self):
        """ Gets the biggest radius that is defined into this graph's nodes """
        result = 0
        for n in self.nodes.itervalues():
            if n.radius > result:
                result = n.radius
        return result

    def extract_unplaced_nodes(self):
        result = GraphBase()
        result.nodes = { n.id: n for n in self.nodes.itervalues() if not n.placed }
        return result;

    def find_root(self):
        roots = []
        for n in self.nodes.itervalues():
            l = self.get_local_links(n)
            if len(l[0]) == 0 and len(l[1]) > 0:
                roots.append((n, len(l[1])))
        rcount = len(roots)
        if rcount == 0:
            return None
        elif rcount == 1:
            return roots[0][0]
        else:
            # If several roots are found, return the one with the most outgoing links
            roots.sort(None, lambda x: x[1], True)
            return roots[0][0]

class GraphGroup(GraphBase):
    """ Defines the structure of a group as available in Graph instances """
    def __init__(self, id, label, shinken_type):
        super(GraphGroup, self).__init__()
        self.id = id
        self.label = label
        self.shinken_type = shinken_type

    def add_node(self, node):
        """ Adds a node into this group. This method is useful as it also makes sure the node is properly removed from any previous group """
        if node.group is not None and node.id in node.group.nodes:
           del node.group[node.id]
        self.nodes[node.id] = node
        node.group = self
        node.radius = 10

_link_key_parser = re.compile(r'^link:([a-zA-Z0-9_\- \$\.]+):([a-zA-Z0-9_\- \$\.]+)$')

class Graph(GraphBase):
    """ A graph root object to which we can add nodes and edges, as well as define groups """
    def __init__(self):
        super(Graph, self).__init__()
        self.groups = {}

    def add_node_from_host(self, shinken_host):
        """ Adds a new node to this graph, filled with informations from the specified Shinken host """
        name = shinken_host['name']
        return self.__add_node_raw(name, name, 'host', 'host')
    
    def add_node_from_service(self, shinken_service):
        """ Adds a new node to this graph, filled with informations from the specified Shinken service """
        name = shinken_service['description']
        return self.__add_node_raw(_generate_service_instance_id(name, shinken_service['host_name']), name, 'service', 'service')
    
    def add_node_virtual(self, id, label, category, **kwargs):
        """ Adds a new node to this graph, as a node that does not match a Shinken entity """
        return self.__add_node_raw(id, label, category, 'virtual', **kwargs)

    def add_node_from_group(self, group):
        result = self.__add_node_raw(group.id, group.label, 'group', 'group')
        left, top, bottom, right, has_content = group.get_bounds()
        result.radius = max(right - left, bottom - top) * 0.7
        return result
        
    def __add_node_raw(self, id, label, category, shinken_type, **kwargs):
        result = GraphNode(id, label, category, shinken_type, **kwargs)
        self.nodes[id] = result
        self.clear_cache()
        return result

    def add_link_from_host_parents(self, shinken_host):
        """
        Adds links to the current graph between the specified host and all of its parents.
        Only hosts already present in the graph will be taken into account.
        """
        if shinken_host['name'] not in self.nodes:
            return # Destination node of the potentially created links is not in the graph
        target_node = self.nodes[shinken_host['name']]
        for p in shinken_host['parents']:
            if p in self.nodes:
                self.__add_link_raw(GraphEdge(self.nodes[p], target_node, 'host_parent'))

    def add_link_from_service_dependency(self, parent_service_host_name, parent_service_description, child_service_host_name, child_service_description):
        """
        Creates an edge on the graph between two ends of a specified service dependency.
        The edge will be created only if both ends are already present in the graph.
        """
        id_from = _generate_service_instance_id(parent_service_description, parent_service_host_name)
        id_to = _generate_service_instance_id(child_service_description, child_service_host_name)
        if id_from in self.nodes and id_to in self.nodes:
            self.__add_link_raw(GraphEdge(self.nodes[id_from], self.nodes[id_to], 'service_dependency'))

    def __add_link_between_groups(self, source_group, target_group):
        if source_group.id not in self.nodes or target_group.id not in self.nodes:
            return
        self.__add_link_raw(GraphEdge(self.nodes[source_group.id], self.nodes[target_group.id], 'group'))

    def __add_link_from_user_data(self, user_data):
        matches = []
        for key in user_data:
            match = _link_key_parser.match(key)
            if match is not None and match.group(1) in self.nodes and match.group(2) in self.nodes:
                self.__add_link_raw(GraphEdge(self.nodes[match.group(1)], self.nodes[match.group(2)], 'user_created'))
                matches.append(key)
        for key in matches:
            del user_data[key]

    def __add_link_raw(self, edge):
        # Drop links to/from nodes that are not in this graph
        if edge.source.id not in self.nodes or edge.target.id not in self.nodes:
            return
    
        # Duplicates filter
        for e in self.nodes[edge.source.id].link_out:
            if e.target == edge.target:
                return
    
        self.nodes[edge.source.id].link_out.append(edge)
        self.nodes[edge.target.id].link_in.append(edge)
        self.clear_cache()

    def add_or_get_group_from_host(self, shinken_host):
        host_name = shinken_host['name']
        if host_name not in self.groups:
            self.groups[host_name] = GraphGroup(host_name, host_name, 'host')
        return self.groups[host_name]

    def get_local_links(self, node):
        """ Returns a tuple containing edges of a node (link_in, link_out), but only with edges whose source and target are inside this graph """
        if node is None or node.id not in self.nodes:
            return ([], [])
        else:
            return (node.link_in, node.link_out)

    def generate_state_data(self):
        """ Generates the dictionnary suitable for saving into the graph state database """
        result = {}
        for n in self.nodes:
            if self.nodes[n].placed:
                result[n + ':x'] = self.nodes[n].x
                result[n + ':y'] = self.nodes[n].y
            for e in self.nodes[n].link_out:
                if e.shinken_type == 'user_created':
                    result['link:' + self.nodes[n].id + ':' + e.target.id] = 'virtual'
        return result

    def generate_full_data(self):
        result = {}
        result['nodes'] = {n: self.nodes[n].__dict__ for n in self.nodes}
        for n in result['nodes']:
            # Before we send back the data, turn edges into simpler objects to avoid circular references
            result['nodes'][n]['link_in'] = map(Graph.__map_edges, result['nodes'][n]['link_in'])
            result['nodes'][n]['link_out'] = map(Graph.__map_edges, result['nodes'][n]['link_out'])
            # Same for the group
            if result['nodes'][n]['group'] is not None:
                result['nodes'][n]['group'] = result['nodes'][n]['group'].id
        # Add groups, only those with at least one node
        result['groups'] = {id: self.groups[id].__dict__ for id in self.groups if len(self.groups[id].nodes) > 0}
        for g in result['groups'].values():
            del g['nodes'] # Remove nodes from groups to avoid circular references. Node->group associations are sotred in the nodes
            for key in g.keys():
                if key.startswith('_'):
                    del g[key] # Remove stuff starting with a _ (no need to have them on the client side)
        return result

    @staticmethod
    def __map_edges(edge):
        return { 'source': edge.source.id, 'target': edge.target.id, 'shinken_type': edge.shinken_type, 'attributes': edge.attributes }

    def read_state_data(self, state_data):
        """
        TODO : Document this
        """
        unused_data = state_data.copy()
        missing_positions = self.__read_position_data(unused_data)
        self.__add_link_from_user_data(unused_data)

        return (unused_data, missing_positions)

    def __read_position_data(self, data):
        has_missing_nodes = False
        for id, node in self.nodes.iteritems():
            if id + ':x' in data:
                node.x = float(data[id + ':x'])
                node.y = float(data[id + ':y'])
                node.placed = True
                del data[id + ':x']
                del data[id + ':y']
            else:
                has_missing_nodes = True

    def extract_groups_graph(self):
        result = Graph()
        for g in self.groups.values():
            result.add_node_from_group(g)
        for n in self.nodes.itervalues():
            if n.group is not None:
                for e in n.link_out:
                    if e.target.group is not None and e.source.group != e.target.group:
                        result.__add_link_between_groups(e.source.group, e.target.group)
        return result


def _generate_service_instance_id(service_description, host_name):
    return host_name + '$' + service_description

def _extract_service_dependencies(shinken_service):
    """
    Tool method that returns an array of parent dependencies
    They are returned as an iterable of (hostname, servicename) tuples
    """
    parent_dep_names = shinken_service['parent_dependencies']
    for parent_name in parent_dep_names:
        if parent_name == shinken_service['host_name']:
            continue # We don't count the containing host as a dependency
        yield parent_name.split('/')


def _create_physical_hosts_graph_structure(hostgroups = None):
    """
    Generates a graph from the Shinken configuration, with hosts as nodes and parent dependencies as edges.
    The hostgroups parameter may contain an array of hostgroup names and can be used for including only hosts belonging to those hostgroups.
    """
    g = Graph()
    permissions = utils.get_contact_permissions(current_user.shinken_contact)
    all_hosts = get_all_hosts()

    for hname, h in all_hosts.iteritems():
        if hname not in permissions['hosts']:
            continue
        if hostgroups is not None:
            if any([group in hostgroups for group in h['groups']]):
                g.add_node_from_host(h)
        else:
            g.add_node_from_host(h)
    
    for hname, h in all_hosts.iteritems():
        if hname not in permissions['hosts']:
            continue
        g.add_link_from_host_parents(h)
    
    return g

def _create_logical_services_graph_structure(hosts = None, servicegroups = None):
    """
    Generates a graph object from the Shinken configuration, containing services as nodes and services dependencies as edges.
    The hosts parameter can contain an array of host names. If provided, only services from those hosts will be included.
    The servicegroups parameter can contain an array of service group names. If provided, only services belonging to those groups will be included.
    """
    g = Graph()
    slist = get_all_services()

    #remove forbidden services
    permissions = utils.get_contact_permissions(current_user.shinken_contact)
    tmp = {}
    for s in slist:
        if s in permissions['services']:
            tmp[s] = slist[s]
    slist = tmp

    # Create nodes
    for h in slist.itervalues():
        for s in h.itervalues():
            include = True
            if hosts is not None:
                include = s['host_name'] in hosts
            if include and servicegroups is not None:
                include = any([group.name in servicegroups for group in s['servicegroups']])
            if include:
                g.add_node_from_service(s)
    
    # Create links
    # We don't really check for duplicates here as the graph object will manage that for us
    for h in slist.itervalues():
        for s in h.itervalues():
            for parent_host, parent_service in _extract_service_dependencies(s):
                g.add_link_from_service_dependency(parent_host, parent_service, s['host_name'], s['description'])


    return g
    
def _create_logical_hosts_graph_structure(hostgroups = None):
    """
    Creates a graph containing one node per service, grouped by host.
    Services may be filtered by containing hostgroup, using the hostgroup
    parameter that may contain an array of strings (hostgroup names)
    """
    g = Graph()
    slist = get_all_services()
    hlist = get_all_hosts()
    permissions = utils.get_contact_permissions(current_user.shinken_contact)
    tmp = {}
    for s in slist:
        if s in permissions['services']:
            tmp[s] = slist[s]
    slist = tmp

    # Nodes
    for sname in slist:
        for hname, s in slist[sname].iteritems():
            h = hlist[hname]
            filtered = False
            # Filter by hostgroups
            if hostgroups is not None:
                filtered = any([test in hostgroups for g in s['host_groups']])
            if not filtered:
                g.add_or_get_group_from_host(h).add_node(g.add_node_from_service(s))
    # Edges
    for sname in slist:
        for s in slist[sname].itervalues():
            for parent_host, parent_service in _extract_service_dependencies(s):
                g.add_link_from_service_dependency(parent_host, parent_service, s['host_name'], s['description'])
    return g

# END Common graph structure tools

# BEGIN Layout execution

def _create_networkx_graph(graph, edge_attributes_generator = None):
    nx_graph = nx.Graph()
    # First the nodes
    for id, n in graph.nodes.iteritems():
        nx_graph.add_node(id, { 'width': n.radius * 2, 'height': n.radius * 2 })
    # then the edges
    for n in graph.nodes.values():
        link_in, link_out = graph.get_local_links(n)
        for e in link_out:
            attrs = {}
            if edge_attributes_generator is not None:
                attrs = edge_attributes_generator(e)
            nx_graph.add_edge(e.source.id, e.target.id, attrs)
    return nx_graph

def _nx_to_graph(coords, graph, from_graphviz = False):
    # Transfer the coordinates into the graph
    # Note that all values are divided by 72, that's because input values are in inches
    # and output values are in points. So we divide to get back to the input scale.
    # Also this behavior is dumb, thanks graphviz !
    converter = 1
    if from_graphviz:
        converter = 72
    for id in coords:
        graph.nodes[id].x = coords[id][0] / converter
        graph.nodes[id].y = coords[id][1] / converter
        graph.nodes[id].placed = True


def _execute_networkx_layout(graph, nx_graph, graphtype):
    coords = nx.pygraphviz_layout(nx_graph, prog = graphtype)
    _nx_to_graph(coords, graph, True)
    
def _execute_igraph(graph, scale, layout_name, **kwargs):
    """ Executes an iGraph layout on the specified graph """
    ig_graph = ig.Graph(directed = True)
    names_index = []
    # First the nodes
    for n in graph.nodes:
        ig_graph.add_vertex(n)
        names_index.append(n)
    # Then the edges
    for n in graph.nodes.values():
        link_in, link_out = graph.get_local_links(n)
        for e in link_out:
            ig_graph.add_edge(e.source.id, e.target.id)

    layout = ig_graph.layout(layout_name, **kwargs)

    layout.scale(scale=(scale, scale)) # So I heard you liked scales...
    for i in range(0, len(names_index)):
        n = names_index[i]
        graph.nodes[n].x = layout[i][0]
        graph.nodes[n].y = layout[i][1]
        graph.nodes[n].placed = True
    
def _fit_unplaced_nodes(graph, non_linear = False):
    """ Moves all unplaced nodes of a graph to a default location. """
    # TODO : Introduce some way to customize the new nodes positionning algorithm
    unplaced = graph.extract_unplaced_nodes()

    if unplaced.is_empty():
        return

    linked = unplaced.extract_linked_nodes()
    isolated = unplaced.extract_unlinked_nodes().nodes.values()

    # First find a position for the new nodes that do have an edge connected
    for node in linked.nodes.itervalues():
        link_in, link_out = graph.get_local_links(node)
        # Let's just position relatively to the first available edge
        # We'll find something better once the rest of the system works :)
        rel_node = None
        if len(link_in) > 0:
            rel_node = link_in[0].source
        else:
            rel_node = link_out[0].target
        t = uniform(0, pi)
        link_length = rel_node.radius * 1.8 + node.radius * 1.8
        node.x = rel_node.x + link_length * cos(t)
        node.y = rel_node.y + link_length * sin(t)
        node.placed = True

    # Now handle the isolated nodes
    if len(isolated) == 0:
        return
    
    top_bound = 0
    if non_linear:
        # This algorithm will place the nodes on concentric circles
        # Sort the nodes by size, desc
        isolated.sort(None, lambda n: n.radius, True)
        ring_size = 0
        # Place the middle node
        isolated[0].x = 0
        isolated[0].y = 0
        isolated[0].placed = True
        i = 1
        max_i = len(isolated)
        max_angle = 2 * pi
        while i < max_i:
            # Compute the new ring's data
            ring_size += (isolated[i - 1].radius * 2) + (isolated[i].radius * 2)
            ring_positions = []
            circumpherence = 2 * pi * ring_size
            current_angle = 0
            # Populate the ring with nodes
            while i < max_i and current_angle < 2*pi:
                ring_positions.append((current_angle, i))
                current_angle += (2 * pi) * (isolated[i].radius * 2 / circumpherence)
                i += 1
                if i < max_i:
                    current_angle += (2 * pi) * ((isolated[i].radius * 2) / circumpherence)
            remainer_margin = ((2 * pi) - current_angle) / len(ring_positions)
            margin_buffer = 0
            for j in range(0, len(ring_positions)):
                slot_angle, slot_index = ring_positions[j]
                slot_angle += margin_buffer
                isolated[slot_index].x = cos(slot_angle) * ring_size
                isolated[slot_index].y = sin(slot_angle) * ring_size
                isolated[slot_index].placed = True
                if isolated[slot_index].y < top_bound:
                    top_bound = isolated[slot_index].y
                margin_buffer += remainer_margin
    else:
        # Place the nodes on lines that behave like lines of text,
        # with automatic line height management so that nodes do not
        # collide horizontally or vertically.
        # The algorithm will try to fit the nodes in a square area
        isolated.sort(None, lambda n: n.radius, True)
        total_length = 0
        positions = []
        for n in isolated:
            if total_length > 0:
                total_length += n.radius
            size = n.radius * 2
            positions.append((n, total_length))
            total_length += size
        line_width = sqrt(total_length) * len(isolated)
        current_line = 0
        previous_lines_width = 0
        max_line_height = 0
        lines_heights = [0] # An array of vertical paddings between line n and n-1
        for i in range(0, len(positions)):
            n, x = positions[i]
            x -= previous_lines_width
            if x > line_width:
                previous_lines_width += x
                x = 0
                if current_line > 0:
                    lines_heights[current_line] += max_line_height * 1.5
                lines_heights.append(lines_heights[current_line] + (max_line_height * 1.5))
                max_line_height = 0
                current_line += 1
            positions[i] = (n, x, current_line)
            if max_line_height < n.radius:
                max_line_height = n.radius
        if current_line > 0:
            lines_heights[current_line] += max_line_height
        for n, x, line in positions:
            n.x = x
            n.y = lines_heights[line]
            n.placed = True
            if n.y < top_bound:
                top_bound = n.y

    # Get the result under the already positionned nodes
    isolated_g = GraphBase()
    isolated_g.nodes = {n.id: n for n in isolated }
    g_left, g_top, g_right, g_bottom, g_filled = graph.get_bounds()
    isolated_g.normalize()
    isolated_g.move_by(0, g_bottom + _base_node_spacing)
        
    
# END Layout execution
        
def _load_graph_data_circular_tree(graph):
    """ Loads the graph data according to the circular circular tree
        layout algorithm. Returns a dictionary for the nodes coordinates.
        This layout uses the graph library 'networkx'
    """
    # We will ask for a radial distance between graph ranks that is big enough to
    # fit the biggest node of the graph. Therefore we need to know what the bigger radius
    # actually is
    nx_graph = _create_networkx_graph(graph)
    nx_graph.graph['graph'] = { 'overlap': 'scale',
                                'ranksep': graph.get_maximum_radius() * 3 }
    _execute_networkx_layout(graph, nx_graph, 'twopi')
    
def _load_graph_data_sfdp(graph):
    """ Loads the graph data according to the SFDP layout algorithm. 
        Returns a dictionary for the nodes coordinates. Uses the graph 
        library 'networkx'
    """
    # This layout cannot work with intividual lenghts for edges. So we'll just use scale
    # the graph to have enough space between nodes
    nx_graph = _create_networkx_graph(graph) 
    nx_graph.graph['graph'] = { 'overlap': 'scale' }
    _execute_networkx_layout(graph, nx_graph, 'sfdp')


def _load_graph_data_grouping(graph):
    """ Loads the graph data according to the grouping layout algorithm.
        Returns a dictionary for the nodes coordinates. Uses the graph
        library 'networkx'.
    """
    nx_graph = _create_networkx_graph(graph)
    nx_graph.graph['graph'] = { 'nodesep': 50, 'ranksep': 100 }
    _execute_networkx_layout(graph, nx_graph, 'dot')
    
def _load_graph_data_circular(graph):
    """ Loads all entities required to lay out a graph in memory, ready 
        to be read from the view. Returns dictionary containing the coordinates 
        according to the circular layout. Uses the graph library 'igraph'.
    """
    center_node = graph.get_node_with_most_links()
    center_node_pos = 0
    if center_node is not None:
        center_node_pos = graph.nodes.keys().index(center_node.id)

    diameter = 0
    for n in graph.nodes.itervalues():
        if n != center_node:
            diameter += n.radius * 3 # we add one radius to create margins between the nodes

    # The star layout creates a circle that is contained within a bounding box of (-1, -1, 1, 1)
    # Therefore we can scale it by the radius of the circle we want to obtain to avoid collisions
    _execute_igraph(graph, diameter / (2 * pi), 'star', center = center_node_pos)

def _load_graph_data_sugiyama(graph):
    """ Loads all entities required to lay out a graph in memory, ready 
        to be read from the view. Returns dictionary containing the coordinates 
        according to the Sugiyama layout. Uses the graph library 'igraph'
    """
    radius = graph.get_maximum_radius()
    _execute_igraph(graph, 1, 'sugiyama', hgap = (radius * 2) + _base_node_spacing, vgap = radius * 2 + _base_node_spacing * 2)
    
def _load_graph_data_reingold_tilford(graph):
    """ Loads all entities required to lay out a graph in memory, ready to 
        be read from the view. Returns dictionary containing the coordinates
        according to the Reingold-Tilford layout. Uses the graph library 'igraph'
    """
    center_node = graph.get_node_with_most_links()
    center_node_pos = 0
    if center_node is not None:
        center_node_pos = graph.nodes.keys().index(center_node.id)

    # This algorithm places all nodes on a grid where each cell is 1 by 1
    # Therefore the only thing we can do is to scale the result relatively
    # to the largest node's size so it does not conflict with neighbors
    _execute_igraph(graph, graph.get_maximum_radius() * 3.5, 'reingold_tilford', root = center_node_pos)
    
def _load_graph_data_spring(graph):
    """ Loads the graph data according to the spring layout algorithm.
        Returns a dictionary for the nodes coordinates. Uses the graph library 'networkx'
    """
    nx_graph = _create_networkx_graph(graph, lambda e: { 'len': (e.source.radius + e.target.radius) * 3 })
    nx_graph.graph['graph'] = { 'overlap': 'false' }
    _execute_networkx_layout(graph, nx_graph, 'neato')
    
def get_host_data(all_hosts):
    """ Returns the most important host data: host IDs, host names and 
        host parents.
    """
    # Create a list which will store all the host id's
    host_id = []
    
    # Create a list of lists for the parents. Each node contains a list of parents
    host_parents = [[]]
    
    # Create a list of names for the nodes
    host_name = []
    
    # Initialize the list of id's and the list of parents for each node from the database
    for i in all_hosts:
        host_id.append(i.id)
        host_parents.append([p.id for p in i.parents])
        host_name.append(i.get_name())
    
    return host_id, host_name, host_parents
    
graphTokenTable = Table('graphtokens', 
                        db.metadata, 
                        db.Column('user_id', db.Integer, primary_key=True),
                        db.Column('graph_id', db.String(128), primary_key=True),
                        db.Column('key', db.String(128), primary_key=True),
                        db.Column('value', db.String(1024)))

_graph_name_parser_expression = re.compile(r'^(?P<type>[\w\.]+)(?:/(?P<path>[a-zA-Z0-9\-_ \.]+))?(?:\$(?P<layout>[\w _\-\.]+))?$')
                        
def _parse_graph_name(full_graph_name):
    # The graph name syntax is:
    # T[/P][$L]
    # Where T is the graph type (physical or logical)
    # Where P is a path to the target component. It could be required depending on the value of T
    # Where L is an optionnal layout name that was saved previously
    
    print 'Tesing name ' + full_graph_name
    
    result = {}
    
    match = _graph_name_parser_expression.match(full_graph_name)
    
    if match is None:
        print 'No match !'
        raise GraphTypeError(full_graph_name)
    
    result['graph'] = match.group('type')
    if result['graph'] == 'physical.hosts':
        pass # No options needed
    elif result['graph'] == 'logical.host':
        result['host'] = match.group('path')
        if result['host'] is None:
            raise GraphTypeError(full_graph_name, "The graph type 'logical.host' is missing the host name argument")
    elif result['graph'] == 'logical.hosts':
        pass
    else:
        raise GraphTypeError(full_graph_name) # unknown graph type !
        
    result['layout'] = match.group('layout')

    return result
    

def loadstate(graphname, layout = None):
    """ Loads all the values stored for the specified graph 
        by the currently connected user.
    """
    uid = current_user.id
    db_state = get_result(graphname, uid)
    
    # Parse the graph name
    graph_options = _parse_graph_name(graphname)
    graph = None
    if graph_options['graph'] == 'physical.hosts':
        graph = _create_physical_hosts_graph_structure()
    elif graph_options['graph'] == 'logical.host':
        graph = _create_logical_services_graph_structure(hosts = [graph_options['host']]) # Fetch all services inside the specified host
    elif graph_options['graph'] == 'logical.hosts':
        graph = _create_logical_hosts_graph_structure()

    if graph is None:
        raise GraphTypeError(graphname)

    if graph.is_empty():
        return graph
    
    delete_states, missing_positions = graph.read_state_data(db_state)
    
    # Delete some values from the database if they weren't useful
    if len(delete_states) > 0:
        # Delete the states we need to delete
        for state in delete_states:
            db.engine.execute(graphTokenTable.delete()\
                 .where(graphTokenTable.c.key == state))
        # Update the db contents
        db_state = get_result(graphname, uid)
    
    # Should we apply a layout ?
    changes = False
    if layout is not None:
        _apply_layout_global(graph, layout)
        changes = True
    # If the layout is being reseted or it is used for the first time, just create the entire layout
    elif len(db_state) == 0:
        _apply_layout_global(graph, 'spring') # The default layout is spring !
        changes = True
    elif missing_positions:
        _fit_unplaced_nodes(graph)
        changes = True
    if changes:
        savestate(graphname, graph.generate_state_data(), True)
    return graph

def _apply_layout_global(graph, layout):
    if len(graph.groups) == 0:
        _apply_layout(graph, layout)
    else:
        for g in graph.groups.values():
            _apply_layout(g, 'circular-tree')
        # After we laid out individual groups, create a fake graph with one node per group
        # so that we can position each group
        gr_graph = graph.extract_groups_graph()
        _apply_layout(gr_graph, layout) # TODO : Use spring for laying out the groups ?
        #gr_graph.scale(3, 3)
        for gr_node in gr_graph.nodes.values():
            graph.groups[gr_node.id].move_by(gr_node.x, gr_node.y)

def _apply_layout(graph, layout):
        graph.clear_positions()
        generator = get_generator(layout)
        linked_graph = graph.extract_linked_nodes()
        if(not linked_graph.is_empty()):
            generator(linked_graph) # Lay out the linked nodes
        _fit_unplaced_nodes(graph, is_generator_circular(layout)) # Lay out the isolated nodes
        graph.normalize()
        graph.move_by(_base_node_spacing, _base_node_spacing) # create some space between the nodes and the origin

def get_result(graphname, uid):
    """ Selects the hosts with their positions from the database. Returns
        the result as a dictionary.
        graphname - the graph layout type
        uid - the current user's ID
    """
    q = select([graphTokenTable.c.key, graphTokenTable.c.value])\
                   .where(graphTokenTable.c.user_id == uid)\
                   .where(graphTokenTable.c.graph_id == graphname)
    rows = db.engine.execute(q)

    return { r[graphTokenTable.c.key] : r[graphTokenTable.c.value] for r in rows }
    
def get_list_saves(graphtype):
    uid = current_user.id
    q = select([graphTokenTable.c.graph_id])\
                    .where(graphTokenTable.c.user_id == uid)\
                    .where(graphTokenTable.c.graph_id.startswith(graphtype + '$'))\
                    .distinct()
    rows = db.engine.execute(q)
    substart = len(graphtype) + 1
    return [r[graphTokenTable.c.graph_id][substart:] for r in rows]

def savestate(graphname, data, clear = False):
    """ Merges the specified data into the current
        user values for the specified graph.

        If clear is true, then all the existing values will be cleared
        before the new ones are saved.
    """
    uid = current_user.id

    # If the graph name does not exist, it's an error
    # TODO : Uncomment
    #if graphname not in _layout_types:
    #    raise GraphTypeError(graphname)

    if clear:
        app.logger.info('Clearing ' + graphname)
        db.engine.execute(graphTokenTable.delete()\
                 .where(graphTokenTable.c.user_id == uid)\
                 .where(graphTokenTable.c.graph_id == graphname))

    inserts = []
    update = graphTokenTable.update()\
                            .where(graphTokenTable.c.user_id == uid)\
                            .where(graphTokenTable.c.graph_id == graphname)\
                            .where(graphTokenTable.c.key == bindparam('tkey'))\
                            .values(value=bindparam('value'))
    delete = graphTokenTable.delete()\
                            .where(graphTokenTable.c.user_id == uid)\
                            .where(graphTokenTable.c.graph_id == graphname)\
                            .where(graphTokenTable.c.key == bindparam('tkey'))

    for key in data:
        if data[key] is None:
            # Remove the value
            db.engine.execute(delete, tkey=key)
        else:
            # Try to update the value
            c = db.engine.execute(update, tkey=key, value=str(data[key]))
            if c.rowcount == 0:
                # Insert
                inserts = inserts + [{'user_id': uid,
                                     'graph_id': graphname,
                                     'key': key,
                                     'value': str(data[key])}]

    if inserts:
        # Check that the current amount of rows + number of rows to insert does not reach the row count limitation
        # We enforce this to prevent a user from making the DB blow up by injecting unlimited random keys
        count_query = select([func.count(graphTokenTable.c.key)])\
                    .where(graphTokenTable.c.user_id == uid)\
                    .where(graphTokenTable.c.graph_id == graphname)
        rows = db.engine.execute(count_query)
        db_count = 0
        for r in rows:
            db_count = r[0]

        max_capacity = app.config.get('GRAPH_STATE_MAX_TOKENS', 1000)
        if db_count + len(inserts) > max_capacity:
            app.logger.warning("Graph state capacity reached ! We cannot store any more data in the user's graph state. User {0}, graph {1}, trying to insert {2} new values over {3} existing. Maximum capacity is {4}".format(uid, graphname, len(inserts), db_count, max_capacity))
        else:
            db.engine.execute(graphTokenTable.insert(), inserts)

def get_generator(layout_name):
    """ Returns the generator's function, according to the layout type
    """
    if layout_name in _layout_types:
        return _layout_types[layout_name][0]
    else:
        raise GraphTypeError(layout_name)

def is_generator_circular(layout_name):
    if layout_name in _layout_types:
        return _layout_types[layout_name][1]
    else:
        raise GraphTypeError(layout_name)

# This dictionnary contains parameters for all the available graph types
# Values contains a function that takes a Graph object as a parameter and lays its nodes out
_layout_types = {
                'sfdp': (_load_graph_data_sfdp, False),
                'circular': (_load_graph_data_circular, True),
                'sugiyama': (_load_graph_data_sugiyama, False),
                'reingold-tilford': (_load_graph_data_reingold_tilford, False),
                'grouping': (_load_graph_data_grouping, False),
                'circular-tree': (_load_graph_data_circular_tree, True),
                'spring': (_load_graph_data_spring, True),
                }

@app.route('/graph/saves/<path:graphtype>')
@login_required
def graph_saves(graphtype):
    """ A service that returns the list of existing saves existing for the specified graph type """
    list = get_list_saves(graphtype)
    return jsondump(list)
                
@app.route('/loadgraph/<path:graphname>')
@login_required
def load_graph(graphname):
    try:
        return jsondump(loadstate(graphname).generate_full_data())
    except GraphTypeError:
        abort(404)
    except DependencyError:
        abort(501)

@app.route('/reset_graph', methods=['GET', 'POST'])
@login_required
def reset_graph():
    """ 
    Resets the specified graph positions, and re-runs an entire layout for it using the specified layout algorithm
    """
    layout_type = request.args.get('layout')
    graph_name = request.args.get('graph')
    if layout_type not in _layout_types:
        return abort(403)

    try:
        return jsondump(loadstate(graph_name, layout_type).generate_state_data())
    except GraphTypeError:
        abort(404)
    except DependencyError:
        abort(501)

@app.route('/graph')
@login_required
def graph_view():
    """ The no-ajax access route. Return the HTML view with a default graph type """
    return render_template('graphview.html', layout_type = 'physical.spring')
    
@app.route('/savegraph', methods = ['POST'])
@login_required
def save_graph():
    """ Stores a graph's data in the user's database
        This allows the website scripts to save the user's preferences
        like node positions

        The request is expected to contain the following POST fields:
        - GRAPHID: The unique ID of the graph being saved.
        - RESET: Optionnal; If present, the user database for this graph will be completely 
                 cleared before anything else.
        - DATA: A JSON dictionnary containing the graph data. No format is enforced for keys and values.
    """
    gid = request.form['GRAPHID']

    try:
        _parse_graph_name(gid)
    except:
        abort(404)

    doreset = 'CLEAR' in request.form
    app.logger.info('SAVING ' + str(doreset));

    # Parse the JSON string
    rawdata = request.form['DATA']

    if not rawdata:
        return ""

    data = json.loads(rawdata, 
                      parse_float=_noconvert,
                      parse_int=_noconvert,
                      parse_constant=_noconvert)

    savestate(gid, data, doreset)

    return ""
    
def _noconvert(str_val):
    """ Utility function used to convert all token values (even numbers) into strings """
    return str_val
