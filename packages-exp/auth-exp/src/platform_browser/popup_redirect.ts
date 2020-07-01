/**
 * @license
 * Copyright 2020 Google LLC
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

import { SDK_VERSION } from '@firebase/app-exp';
import * as externs from '@firebase/auth-types-exp';
import { isEmpty, querystring } from '@firebase/util';

import { AuthEventManager } from '../core/auth/auth_event_manager';
import { AuthErrorCode } from '../core/errors';
import { OAuthProvider } from '../core/providers/oauth';
import { assert } from '../core/util/assert';
import { _generateEventId } from '../core/util/event_id';
import { _getCurrentUrl } from '../core/util/location';
import { _open, AuthPopup } from '../core/util/popup';
import { ApiKey, AppName, Auth } from '../model/auth';
import {
    AuthEventType, EventManager, GapiAuthEvent, GapiOutcome, PopupRedirectResolver
} from '../model/popup_redirect';
import { _openIframe } from './iframe/iframe';

/**
 * URL for Authentication widget which will initiate the OAuth handshake
 */
const WIDGET_URL = '__/auth/handler';

export class BrowserPopupRedirectResolver implements PopupRedirectResolver {
  private eventManager: EventManager|null = null;

  // Wrapping in async even though we don't await anywhere in order
  // to make sure errors are raised as promise rejections
  async openPopup(
    auth: Auth,
    provider: externs.AuthProvider,
    authType: AuthEventType,
    eventId?: string
  ): Promise<AuthPopup> {
    const url = getRedirectUrl(auth, provider, authType, eventId);
    return _open(auth.name, url, _generateEventId());
  }

  async initialize(auth: Auth): Promise<EventManager> {
    if (this.eventManager) {
      return this.eventManager;
    }

    const iframe = await _openIframe(auth);
    const eventManager = new AuthEventManager();
    iframe.register<GapiAuthEvent>('authEvent',
      async (message: GapiAuthEvent) => {
        await eventManager.onEvent(message.authEvent);

        // We always ACK with the iframe
        return { status: GapiOutcome.ACK };
      },
      gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER
    );

    this.eventManager = eventManager;
    return eventManager;
  }
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WidgetParams = {
  apiKey: ApiKey;
  appName: AppName;
  authType: AuthEventType;
  redirectUrl: string;
  v: string;
  providerId?: string;
  scopes?: string;
  customParameters?: string;
  eventId?: string;
};

function getRedirectUrl(
  auth: Auth,
  provider: externs.AuthProvider,
  authType: AuthEventType,
  eventId?: string
): string {
  assert(auth.config.authDomain, auth.name, AuthErrorCode.MISSING_AUTH_DOMAIN);
  assert(auth.config.apiKey, auth.name, AuthErrorCode.INVALID_API_KEY);

  const params: WidgetParams = {
    apiKey: auth.config.apiKey,
    appName: auth.name,
    authType,
    redirectUrl: _getCurrentUrl(),
    v: SDK_VERSION,
    eventId
  };

  if (provider instanceof OAuthProvider) {
    provider.setDefaultLanguage(auth.languageCode);
    params.providerId = provider.providerId || '';
    if (!isEmpty(provider.getCustomParameters())) {
      params.customParameters = JSON.stringify(provider.getCustomParameters());
    }
    const scopes = provider.getScopes();
    if (scopes.length > 0) {
      params.scopes = scopes.join(',');
    }
    // TODO set additionalParams?
    // let additionalParams = provider.getAdditionalParams();
    // for (let key in additionalParams) {
    //   if (!params.hasOwnProperty(key)) {
    //     params[key] = additionalParams[key]
    //   }
    // }
  }

  // TODO: maybe set tid as tenantId
  // TODO: maybe set eid as endipointId
  // TODO: maybe set fw as Frameworks.join(",")

  const url = new URL(
    `https://${auth.config.authDomain}/${WIDGET_URL}?${querystring(params as Record<string, string|number>).slice(1)}`
  );

  return url.toString();
}