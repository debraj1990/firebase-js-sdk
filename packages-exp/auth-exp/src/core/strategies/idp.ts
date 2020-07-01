/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as externs from '@firebase/auth-types-exp';

import {
  signInWithIdp,
  SignInWithIdpRequest
} from '../../api/authentication/idp';
import { Auth } from '../../model/auth';
import { User, UserCredential } from '../../model/user';
import { _link as _linkUser } from '../user/link_unlink';
import { _reauthenticate } from '../user/reauthenticate';
import { assert, debugFail } from '../util/assert';
import { signInWithCredential } from './credential';
import { AuthCredential } from '../credentials';
import { IdTokenResponse } from '../../model/id_token';
import { PhoneOrOauthTokenResponse } from '../../api/authentication/mfa';

export interface IdpTaskParams {
  auth: Auth;
  requestUri: string;
  sessionId?: string;
  tenantId?: string;
  postBody?: string;
  pendingToken?: string;
  user?: User;
}

export type IdpTask = (params: IdpTaskParams) => Promise<UserCredential>;

class IdpCredential implements AuthCredential {
  providerId = externs.ProviderId.CUSTOM;
  signInMethod = externs.SignInMethod.ANONYMOUS; // Unused, should we have an IDP one here?

  constructor(readonly params: IdpTaskParams) {}

  _getIdTokenResponse(auth: Auth): Promise<PhoneOrOauthTokenResponse> {
    return signInWithIdp(auth, this._buildIdpRequest());
  }

  _linkToIdToken(auth: Auth, idToken: string): Promise<IdTokenResponse> {
    return signInWithIdp(auth, this._buildIdpRequest(idToken));
  }

  _getReauthenticationResolver(auth: Auth): Promise<IdTokenResponse> {
    return signInWithIdp(auth, this._buildIdpRequest());
  }

  private _buildIdpRequest(idToken?: string): SignInWithIdpRequest {
    const request: SignInWithIdpRequest = {
      requestUri: this.params.requestUri,
      sessionId: this.params.sessionId,
      postBody: this.params.postBody || null,
      tenantId: this.params.tenantId,
      pendingToken: this.params.pendingToken,
      returnSecureToken: true
    };

    if (idToken) {
      request.idToken = idToken;
    }

    return request;
  }

  toJSON(): object {
    debugFail('Method not implemented.');
  }

  static fromJSON(_json: object | string): AuthCredential | null {
    return debugFail('not implemented');
  }
}

export function _signIn(
  params: IdpTaskParams
): Promise<externs.UserCredential> {
  return signInWithCredential(params.auth, new IdpCredential(params));
}

export function _reauth(
  params: IdpTaskParams
): Promise<externs.UserCredential> {
  const { auth, user } = params;
  assert(user, auth.name);
  return _reauthenticate(user, new IdpCredential(params));
}

export async function _link(
  params: IdpTaskParams
): Promise<externs.UserCredential> {
  const { auth, user } = params;
  assert(user, auth.name);
  return _linkUser(user, new IdpCredential(params));
}