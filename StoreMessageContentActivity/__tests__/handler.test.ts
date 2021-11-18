/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockedInboxOrChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/BlockedInboxOrChannel";
import { CreatedMessageEvent } from "@pagopa/io-functions-commons/dist/src/models/created_message_event";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { ServicesPreferencesModel } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  NonNegativeInteger,
  NonNegativeNumber
} from "@pagopa/ts-commons/lib/numbers";

import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { initTelemetryClient } from "../../utils/appinsights";
import {
  aCreatedMessageEventSenderMetadata,
  aDisabledServicePreference,
  aFiscalCode,
  aMessageContent,
  anEnabledServicePreference,
  aNewMessageWithoutContent,
  aRetrievedMessage,
  aRetrievedProfile,
  aRetrievedServicePreference,
  aServiceId,
  autoProfileServicePreferencesSettings,
  legacyProfileServicePreferencesSettings,
  manualProfileServicePreferencesSettings
} from "../../__mocks__/mocks";
import { getStoreMessageContentActivityHandler } from "../handler";
import {
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import {
  ActivationModel,
  RetrievedActivation
} from "@pagopa/io-functions-commons/dist/src/models/activation";
import { SpecialServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/SpecialServiceCategory";
import { ActivationStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ActivationStatus";

const mockContext = {
  // eslint-disable no-console
  log: {
    error: console.error,
    info: console.log,
    verbose: console.log,
    warn: console.warn
  }
} as any;

const mockTelemetryClient = ({
  trackEvent: jest.fn()
} as unknown) as ReturnType<typeof initTelemetryClient>;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedProfile)));
const lProfileModel = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as ProfileModel;

const activationFindLastVersionMock = jest.fn();
const lActivation = ({
  findLastVersionByModelId: activationFindLastVersionMock
} as unknown) as ActivationModel;

const aBlobResult = {
  name: "ABlobName"
};

const storeContentAsBlobMock = jest.fn(() => TE.of(O.some(aBlobResult)));
const upsertMessageMock = jest.fn<any, any>(() => TE.of(aRetrievedMessage));
const lMessageModel = ({
  storeContentAsBlob: storeContentAsBlobMock,
  upsert: upsertMessageMock
} as unknown) as MessageModel;

const findServicePreferenceMock = jest.fn<any, any>(() =>
  TE.of(O.some(aRetrievedServicePreference))
);
const lServicePreferencesModel = ({
  find: findServicePreferenceMock
} as unknown) as ServicesPreferencesModel;

const lastUpdateTimestamp = Math.floor(new Date().getTime() / 1000);
const aFutureOptOutEmailSwitchDate = new Date(lastUpdateTimestamp + 10);

const aPastOptOutEmailSwitchDate = new Date(lastUpdateTimestamp - 10);

const anOrgFiscalCode = "01111111111" as OrganizationFiscalCode;

const aPaymentData = {
  amount: 1000,
  invalid_after_due_date: false,
  notice_number: "177777777777777777"
};

const aPaymentDataWithPayee = {
  ...aPaymentData,
  payee: {
    fiscal_code: anOrgFiscalCode
  }
};

const aCreatedMessageEvent: CreatedMessageEvent = {
  content: aMessageContent,
  message: aNewMessageWithoutContent,
  senderMetadata: aCreatedMessageEventSenderMetadata,
  serviceVersion: 1 as NonNegativeNumber
};
const aCreatedMessageEventSpecialService: CreatedMessageEvent = {
  ...aCreatedMessageEvent,
  senderMetadata: {
    ...aCreatedMessageEvent.senderMetadata,
    serviceCategory: SpecialServiceCategoryEnum.SPECIAL
  }
};

const aMessageContentWithPaymentData = {
  ...aMessageContent,
  payment_data: aPaymentData
};

const aMessageContentWithPaymentDataWithPayee = {
  ...aMessageContent,
  payment_data: aPaymentDataWithPayee
};
const aRetrievedProfileWithAValidTimestamp = {
  ...aRetrievedProfile,
  _ts: lastUpdateTimestamp
};

const aRetrievedProfileWithLegacyPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: legacyProfileServicePreferencesSettings
};

const aRetrievedProfileWithManualPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: manualProfileServicePreferencesSettings
};

const aRetrievedProfileWithAutoPreferences = {
  ...aRetrievedProfileWithAValidTimestamp,
  servicePreferencesSettings: autoProfileServicePreferencesSettings
};

const aDisabledActivation: RetrievedActivation = {
  _etag: "a",
  _rid: "a",
  _self: "self",
  _ts: 0,
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  kind: "IRetrievedActivation",
  status: ActivationStatusEnum.INACTIVE,
  version: 0 as NonNegativeInteger,
  id: "fake-id" as NonEmptyString
};

const anActiveActivation: RetrievedActivation = {
  ...aDisabledActivation,
  status: ActivationStatusEnum.ACTIVE
};

// utility that adds a given set of serviceIds to the profile's inbox blacklist
const withBlacklist = (profile: RetrievedProfile, services = []) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: [BlockedInboxOrChannelEnum.INBOX]
    }),
    {}
  )
});

const withBlockedEmail = (profile: RetrievedProfile, services = []) => ({
  ...profile,
  blockedInboxOrChannels: services.reduce(
    (obj, serviceId) => ({
      ...obj,
      [serviceId]: [BlockedInboxOrChannelEnum.EMAIL]
    }),
    {}
  )
});

describe("getStoreMessageContentActivityHandler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each`
    scenario                                                                                                                               | profileResult                                                                                               | storageResult  | upsertResult         | preferenceResult                                                    | activationResult              | messageEvent                          | expectedBIOC                         | optOutEmailSwitchDate           | optInEmailEnabled | overrideProfileResult
    ${"a retrieved profile mantaining its original isEmailEnabled property"}                                                               | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)}                              | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"retrieved profile with isEmailEnabled to false"}                                                                                    | ${{ ...aRetrievedProfile, isEmailEnabled: false }}                                                          | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)}                              | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service does not exists in user service preference (AUTO SETTINGS)"}                 | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${O.none}                                                           | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (AUTO SETTINGS)"}           | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"a blocked EMAIL if sender service exists and has EMAIL disabled in user service preference (AUTO SETTINGS)"}                        | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender service exists and is enabled in user service preference (MANUAL SETTINGS)"}         | ${aRetrievedProfileWithManualPreferences}                                                                   | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL if message sender service exists and has EMAIL disabled in user service preference (MANUAL SETTINGS)"}                | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL for a service in blockedInboxOrChannels with email disabled (LEGACY SETTINGS)"}                                       | ${withBlockedEmail(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId])} | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if the service is not in user's blockedInboxOrChannels (LEGACY SETTINGS)"}                             | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["another-service"])}                               | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"isEmailEnabled overridden to false if profile's timestamp is before optOutEmailSwitchDate"}                                         | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aFutureOptOutEmailSwitchDate} | ${true}           | ${{ ...aRetrievedProfileWithAValidTimestamp, isEmailEnabled: false }}
    ${"isEmailEnabled not overridden if profile's timestamp is after optOutEmailSwitchDate"}                                               | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${"not-called"}               | ${aCreatedMessageEvent}               | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${true}           | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender special service exists and is enabled in user service preference (AUTO SETTINGS)"}   | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"a blocked EMAIL if sender special service exists and has EMAIL disabled in user service preference (AUTO SETTINGS)"}                | ${withBlacklist(aRetrievedProfileWithAutoPreferences, [aCreatedMessageEvent.message.senderServiceId])}      | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if message sender special service exists and is enabled in user service preference (MANUAL SETTINGS)"} | ${aRetrievedProfileWithManualPreferences}                                                                   | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(anEnabledServicePreference)}                               | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL if message sender special service exists and has EMAIL disabled in user service preference (MANUAL SETTINGS)"}        | ${aRetrievedProfileWithAutoPreferences}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${O.some({ ...anEnabledServicePreference, isEmailEnabled: false })} | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"blocked EMAIL for a special service in blockedInboxOrChannels with email disabled (LEGACY SETTINGS)"}                               | ${withBlockedEmail(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId])} | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[BlockedInboxOrChannelEnum.EMAIL]} | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"empty blockedInboxOrChannels if the special service is not in user's blockedInboxOrChannels (LEGACY SETTINGS)"}                     | ${withBlacklist(aRetrievedProfileWithLegacyPreferences, ["another-service"])}                               | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${false}          | ${"O.none"}
    ${"isEmailEnabled overridden to false if profile's timestamp is before optOutEmailSwitchDate for special service"}                     | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[]}                                | ${aFutureOptOutEmailSwitchDate} | ${true}           | ${{ ...aRetrievedProfileWithAValidTimestamp, isEmailEnabled: false }}
    ${"isEmailEnabled not overridden if profile's timestamp is after optOutEmailSwitchDate for special service"}                           | ${aRetrievedProfileWithAValidTimestamp}                                                                     | ${aBlobResult} | ${aRetrievedMessage} | ${"not-called"}                                                     | ${O.some(anActiveActivation)} | ${aCreatedMessageEventSpecialService} | ${[]}                                | ${aPastOptOutEmailSwitchDate}   | ${true}           | ${"O.none"}
  `(
    "should succeed with $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      activationResult,
      messageEvent,
      expectedBIOC,
      optOutEmailSwitchDate,
      optInEmailEnabled,
      overrideProfileResult,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipPreferenceMock = preferenceResult === "not-called",
      skipActivationMock = activationResult === "not-called"
    }) => {
      findLastVersionByModelIdMock.mockImplementationOnce(() =>
        TE.of(O.some(profileResult))
      );
      storeContentAsBlobMock.mockImplementationOnce(() =>
        TE.of(O.some(storageResult))
      );
      upsertMessageMock.mockImplementationOnce(() =>
        TE.of(O.some(upsertResult))
      );
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() =>
          TE.of(preferenceResult)
        );
      !skipActivationMock &&
        activationFindLastVersionMock.mockImplementationOnce(() =>
          TE.of(activationResult)
        );

      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          lActivation,
          optOutEmailSwitchDate,
          isOptInEmailEnabled: optInEmailEnabled,
          telemetryClient: mockTelemetryClient
        }
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("SUCCESS");
      if (result.kind === "SUCCESS") {
        expect(result.blockedInboxOrChannels).toEqual(expectedBIOC);
        expect(result.profile).toEqual(
          overrideProfileResult === "O.none"
            ? profileResult
            : overrideProfileResult
        );
      }

      // success means message has been stored and status has been updated
      expect(upsertMessageMock).toHaveBeenCalledTimes(1);
      expect(storeContentAsBlobMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each`
    scenario                                           | profileResult                           | storageResult  | upsertResult         | preferenceResult                       | messageEvent                                                                     | optOutEmailSwitchDate         | optInEmailEnabled | activationResult | expectedMessagePaymentData
    ${"with original payment message with payee"}      | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)} | ${{ ...aCreatedMessageEvent, content: aMessageContentWithPaymentDataWithPayee }} | ${aPastOptOutEmailSwitchDate} | ${false}          | ${"not-called"}  | ${aPaymentDataWithPayee}
    ${"with overridden payee if no payee is provided"} | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.some(aRetrievedServicePreference)} | ${{ ...aCreatedMessageEvent, content: aMessageContentWithPaymentData }}          | ${aPastOptOutEmailSwitchDate} | ${false}          | ${"not-called"}  | ${{ ...aPaymentData, payee: { fiscal_code: aCreatedMessageEvent.senderMetadata.organizationFiscalCode } }}
    ${"with a no payment message"}                     | ${aRetrievedProfileWithAValidTimestamp} | ${aBlobResult} | ${aRetrievedMessage} | ${O.none}                              | ${aCreatedMessageEvent}                                                          | ${aPastOptOutEmailSwitchDate} | ${false}          | ${"not-called"}  | ${undefined}
  `(
    "should succeed with $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      messageEvent,
      optOutEmailSwitchDate,
      optInEmailEnabled,
      expectedMessagePaymentData,
      activationResult,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipActivationMock = activationResult === "not-called"
    }) => {
      findLastVersionByModelIdMock.mockImplementationOnce(() =>
        TE.of(O.some(profileResult))
      );
      storeContentAsBlobMock.mockImplementationOnce(() =>
        TE.of(O.some(storageResult))
      );
      upsertMessageMock.mockImplementationOnce(() =>
        TE.of(O.some(upsertResult))
      );
      findServicePreferenceMock.mockImplementationOnce(() =>
        TE.of(preferenceResult)
      );
      !skipActivationMock &&
        activationFindLastVersionMock.mockImplementationOnce(() =>
          TE.of(activationResult)
        );

      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          lActivation,
          optOutEmailSwitchDate,
          isOptInEmailEnabled: optInEmailEnabled,
          telemetryClient: mockTelemetryClient
        }
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("SUCCESS");

      const msgEvt = messageEvent as CreatedMessageEvent;
      // success means message has been stored and status has been updated
      expect(storeContentAsBlobMock).toHaveBeenCalledWith(
        {} as any,
        msgEvt.message.id,
        {
          ...msgEvt.content,
          payment_data: expectedMessagePaymentData
        }
      );
    }
  );

  it.each`
    scenario                                                                                                  | failureReason              | profileResult                                                                                                    | preferenceResult                                                 | activationResult                                                            | messageEvent
    ${"activity input cannot be decoded"}                                                                     | ${"BAD_DATA"}              | ${"not-called"}                                                                                                  | ${"not-called"}                                                  | ${"not-called"}                                                             | ${{}}
    ${"no profile was found"}                                                                                 | ${"PROFILE_NOT_FOUND"}     | ${O.none}                                                                                                        | ${"not-called"}                                                  | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"inbox is not enabled"}                                                                                 | ${"MASTER_INBOX_DISABLED"} | ${O.some({ ...aRetrievedProfile, isInboxEnabled: false })}                                                       | ${"not-called"}                                                  | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender is blocked"}                                                                            | ${"SENDER_BLOCKED"}        | ${O.some(withBlacklist(aRetrievedProfile, [aCreatedMessageEvent.message.senderServiceId]))}                      | ${"not-called"}                                                  | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (AUTO SETTINGS)"}          | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${O.some(aDisabledServicePreference)}                            | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (AUTO SETTINGS)"}      | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithAutoPreferences)}                                                                  | ${O.some({ anEnabledServicePreference, isInboxEnabled: false })} | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender service does not exists in user service preference (MANUAL SETTINGS)"}                  | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.none}                                                        | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender service exists and is not enabled in user service preference (MANUAL SETTINGS)"}        | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some(aDisabledServicePreference)}                            | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender service exists and has INBOX disabled in user service preference (MANUAL SETTINGS)"}    | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some({ anEnabledServicePreference, isInboxEnabled: false })} | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"service in blockedInboxOrChannels with blocked INBOX (LEGACY SETTINGS)"}                               | ${"SENDER_BLOCKED"}        | ${O.some(withBlacklist(aRetrievedProfileWithLegacyPreferences, [aCreatedMessageEvent.message.senderServiceId]))} | ${"not-called"}                                                  | ${"not-called"}                                                             | ${aCreatedMessageEvent}
    ${"message sender special service does not exists in user service preference and Activation is INACTIVE"} | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.none}                                                        | ${O.some(aDisabledActivation)}                                              | ${aCreatedMessageEventSpecialService}
    ${"message sender special service does not exists in user service preference and Activation not exists"}  | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.none}                                                        | ${O.none}                                                                   | ${aCreatedMessageEventSpecialService}
    ${"message sender special service does not exists in user service preference and Activation is PENDING"}  | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.none}                                                        | ${O.some({ ...aDisabledActivation, status: ActivationStatusEnum.PENDING })} | ${aCreatedMessageEventSpecialService}
    ${"message sender special service exists in user service preference and Activation is INACTIVE"}          | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some(anEnabledServicePreference)}                            | ${O.some(aDisabledActivation)}                                              | ${aCreatedMessageEventSpecialService}
    ${"message sender special service exists in user service preference and Activation not exists"}           | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some(anEnabledServicePreference)}                            | ${O.none}                                                                   | ${aCreatedMessageEventSpecialService}
    ${"message sender special service exists in user service preference and Activation is PENDING"}           | ${"SENDER_BLOCKED"}        | ${O.some(aRetrievedProfileWithManualPreferences)}                                                                | ${O.some(anEnabledServicePreference)}                            | ${O.some({ ...aDisabledActivation, status: ActivationStatusEnum.PENDING })} | ${aCreatedMessageEventSpecialService}
  `(
    "should fail if $scenario",
    async ({
      failureReason,
      profileResult,
      preferenceResult,
      messageEvent,
      activationResult,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipProfileMock = profileResult === "not-called",
      skipPreferenceMock = preferenceResult === "not-called",
      skipActivationMock = activationResult === "not-called"
    }) => {
      !skipProfileMock &&
        findLastVersionByModelIdMock.mockImplementationOnce(() => {
          return TE.of(profileResult);
        });
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(() => {
          return TE.of(preferenceResult);
        });
      !skipActivationMock &&
        activationFindLastVersionMock.mockImplementationOnce(() =>
          TE.of(activationResult)
        );
      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          lActivation,
          optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
          isOptInEmailEnabled: false,
          telemetryClient: mockTelemetryClient
        }
      );

      const result = await storeMessageContentActivityHandler(
        mockContext,
        messageEvent
      );

      expect(result.kind).toBe("FAILURE");
      if (result.kind === "FAILURE") {
        expect(result.reason).toEqual(failureReason);
      }

      // check if models are being used only when expected
      expect(findLastVersionByModelIdMock).toBeCalledTimes(
        skipProfileMock ? 0 : 1
      );
      expect(findServicePreferenceMock).toBeCalledTimes(
        skipPreferenceMock ? 0 : 1
      );
      expect(activationFindLastVersionMock).toBeCalledTimes(
        skipActivationMock ? 0 : 1
      );
    }
  );

  it.each`
    scenario                                                         | profileResult                                            | storageResult                                                | upsertResult                                           | preferenceResult                                        | activationResult                                        | messageEvent
    ${"there is an error while fetching profile"}                    | ${TE.left("Profile fetch error")}                        | ${"not-called"}                                              | ${"not-called"}                                        | ${"not-called"}                                         | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"message store operation fails"}                               | ${TE.of(O.some(aRetrievedProfile))}                      | ${TE.left(new Error("Error while storing message content"))} | ${"not-called"}                                        | ${"not-called"}                                         | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"message upsert fails"}                                        | ${TE.of(O.some(aRetrievedProfile))}                      | ${TE.of(O.some(aBlobResult))}                                | ${TE.left(new Error("Error while upserting message"))} | ${"not-called"}                                         | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (AUTO)"}            | ${TE.of(O.some(aRetrievedProfileWithAutoPreferences))}   | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.left(new Error("Error while reading preference"))} | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"user's service preference retrieval fails (MANUAL SETTINGS)"} | ${TE.of(O.some(aRetrievedProfileWithManualPreferences))} | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.left({ kind: "COSMOS_EMPTY_RESPONSE" })}           | ${"not-called"}                                         | ${aCreatedMessageEvent}
    ${"user's activation retrieval for a service fails"}             | ${TE.of(O.some(aRetrievedProfileWithManualPreferences))} | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.of(O.none)}                                        | ${TE.left(new Error("Error while reading activation"))} | ${aCreatedMessageEventSpecialService}
    ${"user's activation retrieval for a service fails"}             | ${TE.of(O.some(aRetrievedProfileWithManualPreferences))} | ${"not-called"}                                              | ${"not-called"}                                        | ${TE.of(O.none)}                                        | ${TE.left({ kind: "COSMOS_EMPTY_RESPONSE" })}           | ${aCreatedMessageEventSpecialService}
  `(
    "should throw an Error if $scenario",
    async ({
      profileResult,
      storageResult,
      upsertResult,
      preferenceResult,
      activationResult,
      messageEvent,
      // mock implementation must be set only if we expect the function to be called, otherwise it will interfere with other tests
      //   we use "not-called" to determine such
      skipProfileMock = profileResult === "not-called",
      skipStorageMock = storageResult === "not-called",
      skipUpsertMock = upsertResult === "not-called",
      skipPreferenceMock = preferenceResult === "not-called",
      skipActivationMock = activationResult === "not-called"
    }) => {
      !skipProfileMock &&
        findLastVersionByModelIdMock.mockImplementationOnce(
          () => profileResult
        );
      !skipStorageMock &&
        storeContentAsBlobMock.mockImplementationOnce(() => storageResult);
      !skipUpsertMock &&
        upsertMessageMock.mockImplementationOnce(() => upsertResult);
      !skipPreferenceMock &&
        findServicePreferenceMock.mockImplementationOnce(
          () => preferenceResult
        );
      !skipActivationMock &&
        activationFindLastVersionMock.mockImplementationOnce(
          () => activationResult
        );

      const storeMessageContentActivityHandler = getStoreMessageContentActivityHandler(
        {
          lProfileModel,
          lMessageModel,
          lBlobService: {} as any,
          lServicePreferencesModel,
          lActivation,
          optOutEmailSwitchDate: aPastOptOutEmailSwitchDate,
          isOptInEmailEnabled: false,
          telemetryClient: mockTelemetryClient
        }
      );

      await expect(
        storeMessageContentActivityHandler(mockContext, messageEvent)
      ).rejects.toThrow();

      // check if models are being used only when expected
      expect(findLastVersionByModelIdMock).toBeCalledTimes(
        skipProfileMock ? 0 : 1
      );
      expect(storeContentAsBlobMock).toBeCalledTimes(skipStorageMock ? 0 : 1);
      expect(upsertMessageMock).toBeCalledTimes(skipUpsertMock ? 0 : 1);
      expect(findServicePreferenceMock).toBeCalledTimes(
        skipPreferenceMock ? 0 : 1
      );
      expect(activationFindLastVersionMock).toBeCalledTimes(
        skipActivationMock ? 0 : 1
      );
    }
  );
});
