/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

define(['console'], function(Console) {
    /**
     * Manage tooltips
     * [WIP] WORK IN PROGRESS
     * TODO: differenciate public from private methods with _
     * TODO: Add bind method to listen on mousemove and match data-tooltips
     */
    var OnocTooltips = function(){
        this.containers = {
            'main': false,
            'context': false
        };

        this.contentBox = {
            'left': false,
            'top': false,
            'width': false,
            'height': false
        };
        this.visible = false;
        this.namespace = false;
        this.defaultRoot = 'div';

        //set context to body by default
        //TODO: add a setContext method
        this.containers.context = document.body;
        var box = document.body.getBoundingClientRect();
        this.contentBox.left = box.left;
        this.contentBox.top = box.top;
        this.contentBox.width = box.width;
        this.contentBox.height = box.height;
        
    };

    /**
     * Listen on mousemove to the given container and will react if target got an data-tooltip attribute
     */
    OnocTooltips.prototype.bind = function(container){
        container.on('mousemove',function(e){
            var target = e.target;
            var content = target.getAttribute('data-tooltip');
            if(!content){
                this.toogle(false);
                return;
            }
            var template = [{
                'tag': 'div',
                'childs': [{'tag': 'p', 'text': content}]
            }];
            this.show(template,target);
        }.bind(this));
    };

    
    /**
     * Create and/or return the tooltip container
     */
    OnocTooltips.prototype.get = function(){
        return (this.containers.main) ? this.containers.main : this.create();
    };

    /**
     * Create the tooltip container
     */
    OnocTooltips.prototype.create = function(){
        var tooltip = this.createElement({'tag': 'div'});
        tooltip.setAttribute('class','tooltip disabled');
        document.body.appendChild(tooltip);
        this.containers.main = tooltip;
        return tooltip;
    };

    /**
     * Flush tooltip
     */
    OnocTooltips.prototype.flush = function(){
        while(this.containers.main.firstChild)
            this.containers.main.removeChild(this.containers.main.firstChild);
    };

    /**
     * Display or hide tooltip
     * @param {Boolean} force - If defined will force show or hide mode
     */
    OnocTooltips.prototype.toogle = function(force){
        if(typeof force === 'boolean' && !force){
            if(!this.visible) return;
            this.get().setAttribute('class','tooltip disabled');
            this.flush();
            this.visible = false;
        }
        else{
            if(this.visible) return;
            this.get().setAttribute('class','tooltip enabled');
            this.visible = true;
        }
    };

    /**
     * Show new tooltip
     * @param {JSON} template     - DOMTree
     * @param {DOMElement} target - tooltip target
     */
    OnocTooltips.prototype.show = function(template,target){
        //hide and flush any existent tooltip
        if(this.visible){
            this.toogle(false);
        }
        var content = this.build(template);
        var clientRect = target.getBoundingClientRect();
        //default : bottom left
        var x = clientRect.left + window.scrollX + 5;
        var y = clientRect.top + clientRect.height + window.scrollY + 5;

        //check top position
        if((y + 30) > this.contentBox.height - window.scrollY)
            y -= clientRect.height + 30;

        //check right position
        if((x + 100) > this.contentBox.width - window.scrollX){
            if(clientRect.width > 100)
                x -= clientRect.width / 2;
            else
                x -= 100;
        }
        

        this.get().appendChild(content);
        this.get().setAttribute('style','left:'+x+'px;top:'+y+'px;');
        this.toogle();
    };

    /**
     * TODO: removeme?
     */
    OnocTooltips.prototype.setNamespace = function(namespace){
        if(typeof namespace !== 'string'){
            Console.error('[onoc.tooltips] Unable to set namespace',namespace);
            return false;
        }
        this.namespace = namespace;
        return this;
    };

    /**
     * Create a new element from the current namespace if any
     */
    OnocTooltips.prototype.createElement = function(element){
        if(typeof element !== 'object' && !element.tag){
            Console.error('[onoc.tooltips] can\'t create element',element);
            return false;
        }
        var elem = false;
        if(!this.namespace) elem = document.createElement(element.tag);
        else elem = document.createElementNS(this.namespace, element);

        if(element.attr)
            for(var a in element.attr)
                elem.setAttribute(a,element.attr[a]);

        if(element.text)
            elem.appendChild(this.createTextElement(element.text));

        return elem;
    };

    /**
     * Create a new text element from the current namespace if any
     */
    OnocTooltips.prototype.createTextElement = function(text){
        if(typeof text !== 'string'){
            Console.error('[onoc.tooltips] can\'t create text element',text);
            return false;
        }
        return document.createTextNode(text);
    };

    /**
     * Build a DOM Structure from template
     * @param {Array} template - DOM structure
     */
    OnocTooltips.prototype.build = function(template){
        if(typeof template !== 'object'){
            if(typeof template === 'string')
                return this.createElement(template);
            else{
                Console.error('[onoc.tooltips] Can\'t parse template, must be a string or an object',template);
                return false;
            }
        }

        var root = false, level = template;
        if(template.length > 1)
            root = this.containers.main;
        else{
            root = this.createElement(template[0]);
            level = template[0].childs;
        }

        if(level)
            this._append(root,level);

        return root;
    };

    /**
     * Recursive function, append a template tree to the root element
     * @param {DOMElement} root - Top element
     * @param {Array} template   - DOM structure
     * @return root
     */
    OnocTooltips.prototype._append = function(root,template) {
        for(var e in template){
            var elem = this.createElement(template[e]);
            if(template[e].childs) this._append(elem,template[e].childs);
            root.appendChild(elem);
        }
        return root;
    };

    return OnocTooltips;
});
