/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import {
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import {
  EmailNotificationInput,
  getEmailNotificationHandler
} from "../handler";

import * as HtmlToText from "html-to-text";

import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { EmailAddress } from "@pagopa/io-functions-commons/dist/generated/definitions/EmailAddress";
import { MessageBodyMarkdown } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { MessageSubject } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageSubject";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";

import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import * as mail from "@pagopa/io-functions-commons/dist/src/mailer/transports";
import { CreatedMessageEventSenderMetadata } from "@pagopa/io-functions-commons/dist/src/models/created_message_sender_metadata";
import {
  NewNotification,
  NotificationAddressSourceEnum,
  NotificationModel,
  RetrievedNotification
} from "@pagopa/io-functions-commons/dist/src/models/notification";

beforeEach(() => jest.clearAllMocks());

const mockContext = {
  executionContext: { functionName: "funcname" },
  log: {
    // eslint-disable-next-line no-console
    error: console.error,
    // eslint-disable-next-line no-console
    info: console.log,
    // eslint-disable-next-line no-console
    verbose: console.log,
    // eslint-disable-next-line no-console
    warn: console.warn
  }
} as any;

const aMessageId = "A_MESSAGE_ID" as NonEmptyString;

const aNewEmailNotification: NewNotification = {
  channels: {
    [NotificationChannelEnum.EMAIL]: {
      addressSource: NotificationAddressSourceEnum.DEFAULT_ADDRESS,
      toAddress: "to@example.com" as EmailAddress
    }
  },
  fiscalCode: "FRLFRC74E04B157I" as any,
  id: "A_NOTIFICATION_ID" as NonEmptyString,
  kind: "INewNotification",
  messageId: aMessageId
};

const aRetrievedNotification: RetrievedNotification = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewEmailNotification,
  kind: "IRetrievedNotification"
};

const notificationModelMock = ({
  find: jest.fn(() => TE.of(O.some(aRetrievedNotification)))
} as unknown) as NotificationModel;

const aNotificationId = "A_NOTIFICATION_ID" as NonEmptyString;
const anOrganizationFiscalCode = "00000000000" as OrganizationFiscalCode;

const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aMessage = {
  createdAt: new Date(),
  fiscalCode: "FRLFRC74E04B157I" as any,
  id: aMessageId,
  indexedId: aMessageId,
  kind: "INewMessageWithoutContent" as "INewMessageWithoutContent",
  senderServiceId: "s123" as NonEmptyString,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aSenderMetadata: CreatedMessageEventSenderMetadata = {
  departmentName: "IT" as NonEmptyString,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "AgID" as NonEmptyString,
  requireSecureChannels: false,
  serviceName: "Test" as NonEmptyString,
  serviceUserEmail: "email@example.com" as EmailAddress
};

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  limits: {
    maxChildNodes: 2000,
    maxDepth: 200
  },
  tables: true
};
const MAIL_FROM = "IO - l’app dei servizi pubblici <no-reply@io.italia.it>" as NonEmptyString;
const defaultNotificationParams = {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
};

const input: EmailNotificationInput = {
  messageId: aMessage.id,
  notificationId: aNotificationId
};

const lMailerTransporterMock = ({} as unknown) as mail.MailerTransporter;

const mockRetrieveProcessingMessageData = jest.fn().mockImplementation(() =>
  TE.of(
    O.some({
      content: aMessageContent,
      message: aMessage,
      senderMetadata: aSenderMetadata
    })
  )
);

const mockSendMail = jest.spyOn(mail, "sendMail");
mockSendMail.mockReturnValue(TE.of("SUCCESS"));

describe("getEmailNotificationActivityHandler", () => {
  it("should respond with 'SUCCESS' if the mail is sent", async () => {
    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      JSON.stringify(input)
    );

    expect(result.kind).toBe("SUCCESS");
  });

  it("should respond with 'ERROR' if the mail is not sent", async () => {
    const errorMessage: string = "Test Error";

    mockSendMail.mockReturnValueOnce(TE.left(new Error(errorMessage)));

    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    try {
      await GetEmailNotificationActivityHandler(
        mockContext,
        JSON.stringify(input)
      );
    } catch (e) {
      expect(e.message).toBe("Error while sending email: " + errorMessage);
    }
  });
});

describe("html generation", () => {
  it("should generate html from markdown", async () => {
    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      JSON.stringify(input)
    );

    expect(result.kind).toBe("SUCCESS");
    expect(mockSendMail.mock.calls[0][1].text).toMatchSnapshot();
  });

  it("should cut generated html if limits are exceeded", async () => {
    const invalidText = Array.from(
      { length: 300 },
      (_, i) => `${"  ".repeat(i)}* Test`
    ).join("\n");

    mockRetrieveProcessingMessageData.mockImplementationOnce(() =>
      TE.of(
        O.some({
          content: { ...aMessageContent, markdown: invalidText },
          message: aMessage,
          senderMetadata: aSenderMetadata
        })
      )
    );

    const GetEmailNotificationActivityHandler = getEmailNotificationHandler(
      lMailerTransporterMock,
      notificationModelMock,
      mockRetrieveProcessingMessageData,
      defaultNotificationParams
    );

    const result = await GetEmailNotificationActivityHandler(
      mockContext,
      JSON.stringify(input)
    );

    expect(result.kind).toBe("SUCCESS");
    expect(mockSendMail.mock.calls[0][1].text).toMatchSnapshot();
  });
});
