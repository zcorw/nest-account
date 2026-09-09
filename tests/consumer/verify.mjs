import 'reflect-metadata';
import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {AccountModule,AccountService,argon2Passwords} from '@tts-workbench/account-core';
const rows=new Map();
const repository={create:async a=>{rows.set(a.id,a);const {passwordHash,...safe}=a;return safe;},findByLogin:async login=>[...rows.values()].find(a=>a.login===login),get:async id=>rows.get(id),updateDisplayName:async()=>undefined,disable:async()=>{}};
class Consumer{};
Module({imports:[AccountModule.registerAsync({useFactory:()=>({repository,passwords:argon2Passwords,randomId:randomUUID})})]})(Consumer);
const app=await NestFactory.createApplicationContext(Consumer,{logger:false});
try{const service=app.get(AccountService);const account=await service.createAccount({login:'independent',displayName:'Consumer',password:'Independent-password-42'});assert.equal((await service.authenticateCredentials({login:'independent',password:'Independent-password-42'})).id,account.id);console.log('Independent Nest consumer: public tarball exports, types and credentials passed');}finally{await app.close();}
